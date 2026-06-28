import { useState, useContext, useEffect } from 'react';
import { DataContext, } from '../context/DataContext.jsx';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const MAX_VISIBLE_AVATARS = 3;

function SessionUsers() {
  const { sharingUser, activeUsers, sessionId } = useContext(DataContext).data;

  const [orderedUsers, setOrderedUsers] = useState([]);

  // Keep a stable display order while syncing membership AND the latest data
  // (names can resolve after a user first appears), then float the sharing
  // user to the front. Runs on any change to the roster or who's sharing.
  useEffect(() => {
    setOrderedUsers((prev) => {
      const byId = new Map((activeUsers || []).map((u) => [u.user, u]));

      // Preserve prior order for users still present, but pull fresh data so
      // updated names/flags are reflected instead of stale snapshots.
      const kept = prev
        .filter((u) => byId.has(u.user))
        .map((u) => byId.get(u.user));

      const seen = new Set(kept.map((u) => u.user));
      const appended = (activeUsers || []).filter((u) => !seen.has(u.user));

      let next = [...kept, ...appended];

      if (sharingUser) {
        const i = next.findIndex((u) => u.user === sharingUser);
        if (i > 0) {
          next = next.slice();
          const [item] = next.splice(i, 1);
          next.unshift(item);
        }
      }

      return next;
    });
  }, [activeUsers, sharingUser]);

  // A name is only meaningful if it isn't just the raw user id fallback.
  function displayName(user) {
    if (!user?.name || user.name === user.user) return "Anonymous User";
    return user.name;
  }

  function getInitial(user) {
    const name = displayName(user);
    if (name === "Anonymous User") return "?";

    const parts = name.trim().split(/\s+/); // split by spaces
    const firstInitial = parts[0]?.[0]?.toUpperCase() || "";
    const secondInitial = parts[1]?.[0]?.toUpperCase() || "";

    return `${firstInitial}${secondInitial}`;
  }


  function createAvatarsFromJson() {

    const visibleUsers = orderedUsers.slice(0, MAX_VISIBLE_AVATARS)
    const remainingCount = orderedUsers.length - MAX_VISIBLE_AVATARS

    const avatars = visibleUsers.map(user => (
      <div
        key={user.user}
        className="relative group"
      >
        <div className="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 w-48 p-3 mb-2 bottom-full left-1/2 transform -translate-x-1/2 bg-slate-950 border border-slate-800 rounded-lg shadow-xl">
          <p className="text-xs font-medium text-slate-200">{displayName(user)}</p>
          <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-3 h-3 rotate-45 bg-slate-950 border-r border-b border-slate-800"></div>
        </div>
        <Avatar key={user.user} className={`transition-all duration-300 group-hover:scale-110 ring-1 ${user.user === sharingUser ? 'ring-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'ring-slate-700'} ring-offset-1 ring-offset-slate-950`} style={{
          transition: "all 0.2s",
          filter: user.user === sharingUser ? 'brightness(100%)' : 'brightness(60%)',
          marginLeft: user.user === sharingUser ? '0.6rem' : '-0.2rem',
          marginRight: user.user === sharingUser ? '0.6rem' : '-0.2rem'
        }}>
          <AvatarFallback className="bg-slate-800 text-slate-300 text-[10px] font-bold">{getInitial(user)}</AvatarFallback>
        </Avatar>

      </div>
    ));

    if (remainingCount > 0) {
      avatars.push(
        <div key="remaining" className="relative group">
          <div className="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 w-32 p-2 mb-2 bottom-full left-1/2 transform -translate-x-1/2 bg-slate-950 border border-slate-800 rounded-lg shadow-xl">
            <p className="text-[10px] font-medium text-slate-300 text-center">
              {remainingCount} more {remainingCount === 1 ? "user" : "users"}
            </p>
            <div className="absolute -bottom-1 antialised left-1/2 transform -translate-x-1/2 w-2 h-2 rotate-45 bg-slate-950 border-r border-b border-slate-800"></div>
          </div>
          <Avatar
            className="transition-transform group-hover:scale-110 ring-1 ring-slate-700 ring-offset-1 ring-offset-slate-950"
            style={{ marginLeft: "-0.2rem", filter: 'brightness(60%)' }}
          >
            <AvatarFallback className="bg-slate-800 text-slate-400 text-[10px] font-bold">+{remainingCount}</AvatarFallback>
          </Avatar>
        </div>,
      )
    }
    return avatars
  }

  return ((activeUsers?.length > 0 && sessionId) ?
    (<div
      style={{
        position: 'fixed', right: '10px', bottom: '10px'
      }}
    >
      <div className="flex items-center">
        {
          createAvatarsFromJson()
        }

      </div>
    </div>) : null
  )
}

export default SessionUsers;