"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDemoPosts, isPost, mergePosts, validatePost, type Post } from "@/lib/posts";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export type ConnectionStatus = "connecting" | "live" | "offline" | "demo";
const STORAGE_KEY = "the-wall:demo-posts:v1";
const CHANNEL_NAME = "the-wall:demo-updates";
const PAGE_SIZE = 1000;

function readDemoPosts(): Post[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDemoPosts();
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isPost)) {
    throw new Error("Your saved preview posts could not be read. Clear this site's local storage to start again.");
  }
  return mergePosts(parsed);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return `${fallback} ${error.message}`;
  if (error && typeof error === "object" && "message" in error) return `${fallback} ${String(error.message)}`;
  return fallback;
}

export function usePosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [lastSharedId, setLastSharedId] = useState<string | null>(null);
  const error = shareError ?? loadError;
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    isSupabaseConfigured ? "connecting" : "demo",
  );
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const sharingRef = useRef(false);
  const generationRef = useRef(0);
  const isDemo = !isSupabaseConfigured;

  useEffect(() => {
    const generation = ++generationRef.current;
    let canceled = false;

    if (isDemo) {
      const load = async () => {
        try {
          const saved = readDemoPosts();
          if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
          if (!canceled) {
            setPosts(saved);
            setLoadError(null);
          }
        } catch (err) {
          if (!canceled) setLoadError(errorMessage(err, "Browser storage is unavailable."));
        } finally {
          if (!canceled) setIsLoading(false);
        }
      };
      refreshRef.current = load;
      const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === null) void load();
      };
      window.addEventListener("storage", onStorage);
      if (typeof BroadcastChannel !== "undefined") {
        const broadcast = new BroadcastChannel(CHANNEL_NAME);
        broadcastRef.current = broadcast;
        broadcast.onmessage = () => void load();
      }
      void load();
      return () => {
        canceled = true;
        if (generationRef.current === generation) refreshRef.current = null;
        window.removeEventListener("storage", onStorage);
        broadcastRef.current?.close();
        broadcastRef.current = null;
      };
    }

    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch {
      setConnectionStatus("offline");
      setLoadError("Supabase configuration is invalid. Check the project URL and public API key, then restart the app.");
      setIsLoading(false);
      return;
    }
    if (!client) return;
    const supabase = client;
    let fetching = false;
    let fetchAgain = false;
    let subscribed = false;
    let realtimeFailed = false;

    const load = async () => {
      if (fetching) {
        fetchAgain = true;
        return;
      }
      fetching = true;
      try {
        const snapshot: Post[] = [];
        for (let from = 0; !canceled; from += PAGE_SIZE) {
          const { data, error: queryError } = await supabase
            .from("posts")
            .select("id,user_id,body,created_at")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);
          if (queryError) throw queryError;
          snapshot.push(...(data ?? []).filter(isPost));
          if (!data || data.length < PAGE_SIZE) break;
        }
        if (!canceled) {
          setPosts((current) => mergePosts(current, snapshot));
          setLoadError(null);
          setConnectionStatus(subscribed ? "live" : realtimeFailed ? "offline" : "connecting");
        }
      } catch (err) {
        if (!canceled) {
          setLoadError(errorMessage(err, "Couldn't load the wall. Please try again."));
          setConnectionStatus("offline");
        }
      } finally {
        fetching = false;
        if (!canceled) {
          setIsLoading(false);
          if (fetchAgain) {
            fetchAgain = false;
            void load();
          }
        }
      }
    };
    refreshRef.current = load;

    // A second fetch after SUBSCRIBED closes the initial fetch/subscription gap.
    const channel = supabase
      .channel(`wall-posts-${generation}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
        if (!canceled && isPost(payload.new)) {
          setPosts((current) => mergePosts(current, [payload.new as Post]));
        }
      })
      .subscribe((status) => {
        if (canceled) return;
        subscribed = status === "SUBSCRIBED";
        if (subscribed) {
          realtimeFailed = false;
          setConnectionStatus("live");
          void load();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          realtimeFailed = true;
          setConnectionStatus("offline");
        }
      });

    const onOnline = () => void load();
    const onOffline = () => setConnectionStatus("offline");
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    void load();

    return () => {
      canceled = true;
      if (generationRef.current === generation) refreshRef.current = null;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [isDemo]);

  const refresh = useCallback(async () => {
    await refreshRef.current?.();
  }, []);

  const share = useCallback(async (body: string): Promise<boolean> => {
    const validationError = validatePost(body);
    if (validationError) {
      setShareError(validationError);
      return false;
    }
    if (sharingRef.current) return false;
    sharingRef.current = true;
    setIsSharing(true);
    setShareError(null);
    try {
      if (isDemo) {
        const post: Post = {
          id: crypto.randomUUID(),
          user_id: null,
          body: body.trim(),
          created_at: new Date().toISOString(),
          author: "Alex Morgan",
          likes: 0,
        };
        const next = mergePosts(readDemoPosts(), [post]);
        // Confirm persistence before reporting a successful share.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setPosts(next);
        setLastSharedId(post.id);
        broadcastRef.current?.postMessage("posts-updated");
      } else {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured.");
        const { data, error: insertError } = await supabase
          .from("posts")
          .insert({ body: body.trim(), user_id: null })
          .select("id,user_id,body,created_at")
          .single();
        if (insertError) throw insertError;
        if (!data || !isPost(data)) throw new Error("The saved post could not be read back.");
        setPosts((current) => mergePosts(current, [data]));
        setLastSharedId(data.id);
      }
      return true;
    } catch (err) {
      setShareError(errorMessage(err, "Your message wasn't shared. Please try again."));
      return false;
    } finally {
      sharingRef.current = false;
      setIsSharing(false);
    }
  }, [isDemo]);

  const errorKind = shareError ? "share" : loadError ? "load" : null;
  return { posts, isLoading, isSharing, error, errorKind, connectionStatus, isDemo, lastSharedId, share, refresh };
}
