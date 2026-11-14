"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Check, ChevronDown, ChevronRight, CircleHelp, Copy, Globe2, Heart, House, LoaderCircle, MessageCircle, MoreHorizontal, Search, Send, Smile, Sparkles, ThumbsUp, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePosts } from "@/hooks/use-posts";
import { characterCount, MAX_POST_LENGTH, type Post } from "@/lib/posts";

type View = "all" | "mine" | "saved";
const PEOPLE = [
  { name: "Alex Morgan", color: "#b7c7b7", image: "alex", note: "Here for the good conversations." },
  { name: "Maya Chen", color: "#d0b7a2", image: "maya", note: "Collecting little moments." },
  { name: "Jordan Lee", color: "#adc0ca", image: "jordan", note: "Probably making a playlist." },
  { name: "Sam Rivera", color: "#c4b6ce", image: "sam", note: "A friend of the internet." },
  { name: "Taylor Kim", color: "#d8c6a6", image: "taylor", note: "Finding joy in the everyday." },
];

function person(name: string) { return PEOPLE.find(p => p.name === name) ?? PEOPLE[0]; }

function Avatar({ name = "Alex Morgan", large = false, small = false }: { name?: string; large?: boolean; small?: boolean }) {
  const p = person(name);
  const [failed, setFailed] = useState(false);
  return <span className={`avatar ${large ? "avatar-large" : ""} ${small ? "avatar-small" : ""}`} style={{ background: p.color }}>
    <span aria-hidden="true">{name.split(" ").map(n => n[0]).join("")}</span>
    {!failed && <img src={`/avatars/${p.image}.svg`} alt={name} onError={() => setFailed(true)} />}
  </span>;
}

function timeAgo(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr${minutes >= 120 ? "s" : ""} ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(minutes > 525600 ? { year: "numeric" } : {}) });
}

function readList(key: string): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; } catch { return []; }
}

export function Wall() {
  const { posts, isLoading, isSharing, error, errorKind, connectionStatus, isDemo, lastSharedId, share, refresh } = usePosts();
  const [body, setBody] = useState("");
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [myPosts, setMyPosts] = useState<string[]>([]);
  const [dialog, setDialog] = useState<"about" | "people" | "profile" | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const count = characterCount(body);

  useEffect(() => {
    setSaved(readList("wall:saved")); setLiked(readList("wall:liked")); setMyPosts(readList("wall:mine"));
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);

  function toggle(id: string, key: string, list: string[], setter: (v: string[]) => void) {
    const next = list.includes(id) ? list.filter(item => item !== id) : [...list, id];
    try { localStorage.setItem(key, JSON.stringify(next)); setter(next); } catch { setNotice("Your browser couldn't save that preference."); }
  }

  async function submitPost() {
    if (await share(body)) {
      setBody(""); setView("all"); setQuery(""); setNotice("Your post is on the wall!");
      setNow(Date.now());
    }
  }

  // Remember this browser's successful shares without claiming ownership of other visitors' posts.
  useEffect(() => {
    if (!lastSharedId) return;
    const next = [...new Set([...readList("wall:mine"), lastSharedId])];
    setMyPosts(next);
    try { localStorage.setItem("wall:mine", JSON.stringify(next)); } catch { /* Posting still succeeds without preference storage. */ }
  }, [lastSharedId]);

  const filteredPosts = posts.filter(post => {
    if (view === "saved" && !saved.includes(post.id)) return false;
    if (view === "mine" && !myPosts.includes(post.id)) return false;
    return !query.trim() || `${post.author ?? "Alex Morgan"} ${post.body}`.toLowerCase().includes(query.toLowerCase().trim());
  });

  const live = connectionStatus === "live";
  const statusLabel = live ? "Live updates on" : connectionStatus === "demo" ? "Preview mode" : connectionStatus === "offline" ? "Reconnecting" : "Connecting";

  return <>
    <a href="#main-content" className="skip-link">Skip to the wall</a>
    <header className="topbar">
      <div className="topbar-inner">
        <a className="wordmark" href="/" aria-label="Facebook Wall home">facebook<span className="wordmark-divider" /><span className="wordmark-edition">the wall</span></a>
        <nav className="top-nav" aria-label="Main navigation">
          <button className="top-nav-active" onClick={() => {setView("all");setQuery("");}}>Home</button>
          <button onClick={() => setDialog("profile")}>Profile</button>
          <button onClick={() => setDialog("people")}>Friends <span className="nav-count">5</span></button>
        </nav>
        <button className="header-profile" onClick={() => setDialog("profile")}><Avatar small /><span>Alex</span><ChevronDown size={13} /></button>
      </div>
    </header>

    <div className="page-shell">
      <aside className="left-sidebar">
        <button className="profile-card" onClick={() => setDialog("profile")}>
          <div className="profile-photo-wrap"><Avatar large /><span className="online-dot" /></div>
          <strong>Alex Morgan</strong><span>Just happy to be here.</span>
        </button>
        <div className="sidebar-divider" />
        <nav className="side-nav" aria-label="Wall views">
          <button aria-pressed={view === "all"} className={view === "all" ? "selected" : ""} onClick={() => { setView("all");setQuery("");}}><House size={18} /><span>The Wall</span><ChevronRight size={14} /></button>
          <button aria-pressed={view === "mine"} className={view === "mine" ? "selected" : ""} onClick={() => {setView("mine");setQuery("");}}><MessageCircle size={18} /><span>My posts</span>{myPosts.length > 0 && <span className="side-count">{myPosts.length}</span>}</button>
          <button aria-pressed={view === "saved"} className={view === "saved" ? "selected" : ""} onClick={() => {setView("saved");setQuery("");}}><Bookmark size={18} /><span>Saved posts</span>{saved.length > 0 && <span className="side-count">{saved.length}</span>}</button>
          <button onClick={() => setDialog("people")}><Users size={18} /><span>Friends</span><span className="side-count">5</span></button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-section-heading">A LITTLE THROWBACK</div>
        <button className="about-link" onClick={() => setDialog("about")}><span className="year-icon">08</span><span>About this wall<small>The internet, a little simpler.</small></span></button>
        <div className="sidebar-note"><Heart size={14} /><p>Less noise.<br />More keeping in touch.</p></div>
      </aside>

      <main id="main-content" className="main-column">
        <div className="wall-heading"><div><div className="eyebrow">GOOD TO SEE YOU AGAIN</div><h1>The Wall<span>.</span></h1></div><div className={`live-status ${live || isDemo ? "" : "status-offline"}`} title={isDemo ? "Preview posts are saved in this browser." : "New posts appear automatically."}><span />{statusLabel}</div></div>
        <p className="wall-subtitle">A familiar place. A few good friends. What’s new with you?</p>

        <form className="composer panel" onSubmit={event => {event.preventDefault(); void submitPost();}}>
          <div className="composer-heading"><MessageCircle size={16} fill="currentColor" strokeWidth={1.3} /><span>Update status</span><span className="composer-public"><Globe2 size={12} /> Public wall</span></div>
          <div className="composer-input"><Avatar /><Textarea ref={textarea} aria-label="What's on your mind?" placeholder="What’s on your mind, Alex?" value={body} disabled={isSharing} onChange={event => setBody(Array.from(event.target.value).slice(0, MAX_POST_LENGTH).join(""))} onKeyDown={event => {if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && body.trim() && !isSharing) {event.preventDefault(); event.currentTarget.form?.requestSubmit();}}} aria-describedby="character-count" /></div>
          <div className="composer-footer"><button type="button" className="smile-button" aria-label="Add a smile" disabled={isSharing || count >= MAX_POST_LENGTH} onClick={() => {if(count < MAX_POST_LENGTH) setBody(body + "☺");textarea.current?.focus();}}><Smile size={19} /></button><span className="composer-hint">A little update goes a long way.</span><span id="character-count" className={`character-count ${count >= 260 ? "near-limit" : ""}`}>{count}<span> / 280</span></span><Button type="submit" className="share-button" disabled={!body.trim() || count > MAX_POST_LENGTH || isSharing}>{isSharing ? <LoaderCircle size={14} className="spin" /> : null}{isSharing ? "Sharing…" : "Share"}</Button></div>
        </form>

        {error && <div className="error-banner" role="alert"><CircleHelp size={17} /><span>{error}</span><button disabled={isSharing || (errorKind === "share" && !body.trim())} onClick={() => errorKind === "share" ? void submitPost() : void refresh()}>Try again</button></div>}

        <div className="feed-toolbar"><div className="feed-tabs" aria-label="Feed filter"><button aria-pressed={view === "all"} className={view === "all" ? "active" : ""} onClick={() => setView("all")}>All posts</button><button aria-pressed={view === "mine"} className={view === "mine" ? "active" : ""} onClick={() => setView("mine")}>My posts</button>{view === "saved" && <button className="active">Saved posts</button>}</div><div className="feed-order"><span className="sort-lines">≡</span> Newest first</div></div>

        {query && <div className="search-summary">Results for “{query}”<button aria-label="Clear search" onClick={() => setQuery("")}><X size={14}/></button></div>}
        <section className="feed" aria-label="Wall posts" aria-busy={isLoading}>
          {isLoading ? <div className="loading-panel panel"><LoaderCircle className="spin" size={20} /><span>Getting the wall ready…</span></div> : errorKind === "load" && posts.length === 0 ? <div className="empty-state panel"><Globe2 size={32} strokeWidth={1.3}/><h2>The wall is out of reach</h2><p>We could not load your posts. Check your connection and try again.</p><Button variant="outline" onClick={() => void refresh()}>Reload the wall</Button></div> : filteredPosts.length === 0 ? <div className="empty-state panel"><MessageCircle size={32} strokeWidth={1.3}/><h2>{query ? "No posts found" : view === "saved" ? "Keep a little something" : view === "mine" ? "Your story starts here" : "It’s a fresh start."}</h2><p>{query ? "Try a different name or a few other words." : view === "saved" ? "Save a post from its ••• menu to come back to it." : "Share a thought, say hello, or tell us how your day is going."}</p>{view !== "saved" && !query && <Button variant="outline" onClick={() => textarea.current?.focus()}>Write a post <Send size={13}/></Button>}</div> : filteredPosts.map(post => <PostCard key={post.id} post={post} now={now} liked={liked.includes(post.id)} saved={saved.includes(post.id)} onLike={() => toggle(post.id,"wall:liked",liked,setLiked)} onSave={() => toggle(post.id,"wall:saved",saved,setSaved)} onNotice={setNotice} onPerson={() => setDialog(post.author && post.author !== "Alex Morgan" ? "people" : "profile")} />)}
        </section>
        {!isLoading && filteredPosts.length > 0 && <div className="feed-end"><span /><Heart size={13} /><span /><p>You’re all caught up. Go make a little memory.</p></div>}
      </main>

      <aside className="right-sidebar">
        <label className="search-box"><Search size={16}/><input aria-label="Search the wall" placeholder="Search the wall…" value={query} onChange={event => setQuery(event.target.value)} /><kbd>/</kbd></label>
        <div className="welcome-card panel"><div className="welcome-art" aria-hidden="true"><div className="art-window"><div className="art-window-bar"><i/><i/><i/></div><div className="art-f">f</div><div className="art-bubble"><Heart size={18} fill="currentColor"/></div><div className="art-cursor">↖</div></div><span className="art-spark one">✦</span><span className="art-spark two">✧</span><span className="est-badge">EST. 2008 ENERGY</span></div><div className="welcome-copy"><h2>Remember this feeling?</h2><p>Before the algorithms.<br />Before the endless scroll.<br />Just a wall, and your people.</p><button onClick={() => setDialog("about")}>Welcome back to the good old days <ChevronRight size={13}/></button></div></div>

        <section className="community-card"><div className="section-heading"><h2>Around the wall</h2><Users size={16}/></div><p>A few familiar faces. Always room for more.</p><div className="friend-stack">{PEOPLE.map(p => <button key={p.name} onClick={() => setDialog("people")} aria-label={`About ${p.name}`}><Avatar name={p.name}/></button>)}</div><button className="text-link" onClick={() => setDialog("people")}>Say hello to the community <ChevronRight size={13}/></button></section>

        <section className="wall-rules panel"><div className="rules-icon"><Sparkles size={17}/></div><h2>A good wall starts with you.</h2><p>Be kind. Be yourself. Share the small stuff. That’s what friends are for.</p><div className="rule-limit"><span>280 characters.</span> Endless possibilities.</div></section>

        <div className="connection-note"><span className={`connection-dot ${live ? "is-live" : ""}`} /><span>{isDemo ? "Preview · saved in this browser" : live ? "Connected. Keeping you up to date." : connectionStatus === "offline" ? "Connection interrupted. Retrying…" : "Connecting to the wall…"}</span></div>
        <footer className="site-footer"><div><button onClick={() => setDialog("about")}>About</button><span>·</span><button onClick={() => setDialog("about")}>Community guidelines</button></div><p>The Wall © {now ? new Date(now).getFullYear() : "2026"}</p><span>Made for a little more connection.</span></footer>
      </aside>
    </div>

    <div className="sr-only" role="status" aria-live="polite">{isLoading ? "Loading the wall." : `${posts.length} posts on the wall. ${statusLabel}.`}</div>
    <div className={`toast ${notice ? "toast-visible" : ""}`} role="status"><Check size={16}/>{notice}</div>

    <Dialog open={dialog !== null} onOpenChange={open => {if(!open) setDialog(null);}}><DialogContent><DialogHeader><DialogTitle>{dialog === "people" ? "Your corner of the internet" : dialog === "profile" ? "Hey, Alex." : "A little more like 2008."}</DialogTitle><DialogDescription>{dialog === "people" ? "Meet the familiar faces in our preview community." : dialog === "profile" ? "One shared identity. A wall for everyone." : "The Wall brings back the simple pleasure of keeping in touch."}</DialogDescription></DialogHeader>{dialog === "people" ? <div className="people-list">{PEOPLE.map(p => <div key={p.name}><Avatar name={p.name}/><span><strong>{p.name}</strong><small>{p.note}</small></span><Heart size={16}/></div>)}<p className="dialog-note">These are our sample community profiles. Public posts use the shared name Alex Morgan. No sign-up needed.</p></div> : dialog === "profile" ? <div className="profile-dialog"><Avatar large/><h3>Alex Morgan</h3><p>Just happy to be here.</p><div className="profile-stats"><div><strong>{myPosts.length}</strong><span>Your posts</span></div><div><strong>{saved.length}</strong><span>Saved posts</span></div><div><strong>{posts.length}</strong><span>On the wall</span></div></div><p className="dialog-note">Everyone shares as Alex. Your posts, saves, and likes are remembered on this browser. No account required.</p></div> : <div className="about-dialog"><div className="about-year">Hello, 2008<span>♥</span></div><p>A place for everyday updates, passing thoughts, and saying hello. Every post appears newest first, with no algorithm in between.</p><h3>A few simple house rules</h3><ul><li>Keep it kind, and respect each other.</li><li>Leave personal or sensitive details off the public wall.</li><li>Make your little update count: 280 characters or fewer.</li></ul><p className="dialog-note">{isDemo ? "You’re in preview mode. Posts are saved in this browser and shared with your other open tabs." : "Posts are public, saved in Supabase, and updated live for everyone. Likes and saved posts stay on your browser."} This is an independent nostalgia project, unaffiliated with Meta.</p></div>}</DialogContent></Dialog>
  </>;
}

function PostCard({ post, now, liked, saved, onLike, onSave, onNotice, onPerson }: { post: Post; now: number; liked: boolean; saved: boolean; onLike: () => void; onSave: () => void; onNotice: (v: string) => void; onPerson: () => void }) {
  const name = post.author ?? "Alex Morgan";
  const likes = (post.likes ?? 0) + (liked ? 1 : 0);
  async function copy() { try { await navigator.clipboard.writeText(post.body); onNotice("Post copied to clipboard."); } catch { onNotice("Couldn't access the clipboard. You can select and copy the post."); } }
  return <article className="post-card panel"><div className="post-top"><button onClick={onPerson} className="post-avatar" aria-label={`View ${name}`}><Avatar name={name}/></button><div className="post-meta"><button className="author-name" onClick={onPerson}>{name}</button><div><time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString()}>{timeAgo(post.created_at,now || Date.now())}</time><span>·</span><Globe2 size={11}/></div></div>{saved && <Bookmark className="saved-indicator" size={14} fill="currentColor"/>}<DropdownMenu><DropdownMenuTrigger asChild><button className="post-more" aria-label={`Options for ${name}'s post`}><MoreHorizontal size={20}/></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={onSave}><Bookmark size={14}/>{saved ? "Unsave post" : "Save post"}</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onSelect={() => void copy()}><Copy size={14}/>Copy text</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><p className="post-body">{post.body}</p>{likes > 0 && <div className="post-reactions"><span className="reaction-icon"><ThumbsUp size={10} fill="currentColor"/></span><span>{liked ? likes === 1 ? "You like this" : `You and ${likes - 1} ${likes === 2 ? "other" : "others"}` : `${likes} ${likes === 1 ? "person likes" : "people like"} this`}</span></div>}<div className="post-actions"><button onClick={onLike} className={liked ? "is-liked" : ""} aria-pressed={liked}><ThumbsUp size={16} fill={liked ? "currentColor" : "none"}/>{liked ? "Liked" : "Like"}</button><button onClick={onSave} aria-pressed={saved}><Bookmark size={15} fill={saved ? "currentColor" : "none"}/>{saved ? "Saved" : "Save"}</button><span className="post-public"><Globe2 size={11}/> Shared with everyone</span></div></article>;
}
