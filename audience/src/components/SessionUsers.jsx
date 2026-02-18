import { useState, useContext, useEffect, useMemo } from 'react';
import { DataContext, } from '../context/DataContext.jsx';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const CDN = `https://cdn.discordapp.com`
const SIZE = 256
const MAX_VISIBLE_AVATARS = 3

const queryParams = new URLSearchParams(window.location.search);
const isEmbedded = queryParams.get('frame_id') != null;

function SessionUsers() {
  const { sharingUser, activeUsers, sessionId } = useContext(DataContext).data;

  const [orderedUsers, setOrderedUsers] = useState([]);


  useEffect(() => {
    // Build a set of current IDs
    const incomingIds = new Set(activeUsers.map(u => u.user));
    // Keep existing order for users still present
    const kept = orderedUsers.filter(u => incomingIds.has(u.user));

    // Append any new users at the end, in the order they appear
    const seen = new Set(kept.map(u => u.user));
    const appended = activeUsers.filter(u => !seen.has(u.user));

    setOrderedUsers([...kept, ...appended]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    console.log(orderedUsers)
  }, [activeUsers]); // important: DON'T depend on sharingUser here

  useEffect(() => {

    if (!sharingUser) return;
    const i = orderedUsers.findIndex(u => u.user === sharingUser);
    if (i <= 0) return;          // not found or already first
    const copy = orderedUsers.slice();
    const [item] = copy.splice(i, 1);        // remove at i
    copy.unshift(item);
    console.log(copy)
    setOrderedUsers(copy);
  }, [sharingUser]); // important: DON'T depend on sharingUser here

  function getAvatarUrl(user) {
    if (user.discordData.avatar != null) {
      return `${CDN}/avatars/${user.discordData.id}/${user.discordData.avatar}.png?size=${SIZE}`;
    } else {
      const defaultAvatarIndex = (BigInt(user.discordData.id) >> 22n) % 6n;
      return `${CDN}/embed/avatars/${defaultAvatarIndex}.png?size=${SIZE}`;
    }
  }
  function getInitial(user) {
    if (!user?.name) return "?";

    const parts = user.name.trim().split(/\s+/); // split by spaces
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
        <div className="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 w-48 p-3 mb-2 bottom-full left-1/2 transform -translate-x-1/2 bg-white rounded-md ">

          <p className="text-sm text-gray-600">{user.name ? user.name : "Anonymous User"}</p>
          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 rotate-45 bg-white border-r border-b border-gray-200"></div>
        </div>
        <Avatar key={user.user} className="transition-transform group-hover:scale-110 ring-1 ring-gray-700 ring-offset-1 ring-offset-black" style={{
          transition: "all 0.2s",
          filter: user.user === sharingUser ? 'brightness(100%)' : 'brightness(50%)',
          marginLeft: user.user === sharingUser ? '0.6rem' : '-0.3rem',
          marginRight: user.user === sharingUser ? '0.6rem' : '-0.3rem'
        }}>
          {isEmbedded ? <AvatarImage src={getAvatarUrl(user)} /> : <AvatarFallback className="text-gray-800 font-semibold">{getInitial(user)}</AvatarFallback>}

        </Avatar>

      </div>
    ));

    if (remainingCount > 0) {
      avatars.push(
        <div key="remaining" className="relative group">
          <div className="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 w-48 p-3 mb-2 bottom-full left-1/2 transform -translate-x-1/2 bg-white rounded-md ">
            <p className="text-sm text-gray-600">
              {remainingCount} more {remainingCount === 1 ? "user" : "users"}
            </p>
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 rotate-45 bg-white border-r border-b border-gray-200"></div>
          </div>
          <Avatar
            className="transition-transform group-hover:scale-110 ring-1 ring-gray-700 ring-offset-1 ring-offset-black"
            style={{ marginLeft: "-0.3rem", filter: 'brightness(50%)' }}
          >
            <AvatarFallback className="text-gray-800 font-semibold">+{remainingCount}</AvatarFallback>
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