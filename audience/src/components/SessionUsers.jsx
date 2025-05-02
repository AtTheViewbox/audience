import { useState, useContext, useEffect } from 'react';
import { DataContext,  } from '../context/DataContext.jsx';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const CDN = `https://cdn.discordapp.com`
const SIZE = 256

const queryParams = new URLSearchParams(window.location.search);
const isEmbedded = queryParams.get('frame_id') != null;

function SessionUsers() {
  const { sharingUser, activeUsers,sessionId } = useContext(DataContext).data;
  function getAvatarUrl(user) {
    if (user.discordData.avatar != null) {
      return `${CDN}/avatars/${user.discordData.id}/${user.discordData.avatar}.png?size=${SIZE}`;
    } else {
      const defaultAvatarIndex = (BigInt(user.discordData.id) >> 22n) % 6n;
      return `${CDN}/embed/avatars/${defaultAvatarIndex}.png?size=${SIZE}`;
    }
  }
  function getInitial(user) {
    if (user.email) {
      return user.email[0].toUpperCase();
    } else {
      return "?";
    }
  }
  
  function createAvatarsFromJson(activeUsers) {
    return activeUsers.map(user => (
      <div
            key={user.user}
            className="relative group"
          >
          <div className="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 w-48 p-3 mb-2 bottom-full left-1/2 transform -translate-x-1/2 bg-white rounded-md ">
           
              <p className="text-sm text-gray-600">{user.email?user.email:"Anonymous User"}</p>
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 rotate-45 bg-white border-r border-b border-gray-200"></div>
            </div>
      <Avatar  key={user.user} className="transition-transform group-hover:scale-110 ring-1 ring-gray-700 ring-offset-1 ring-offset-black" style={{ transition: "all 0.2s", 
                                    filter: user.user === sharingUser ? 'brightness(100%)' : 'brightness(50%)',
                                    marginLeft: user.user === sharingUser ? '0.6rem' : '-0.3rem',
                                    marginRight: user.user === sharingUser ? '0.6rem' : '-0.3rem' }}>
        {isEmbedded ? <AvatarImage src={getAvatarUrl(user)} /> : <AvatarFallback className="text-gray-800 font-semibold">{getInitial(user)}</AvatarFallback>}
      
      </Avatar>
      
      </div>
    ));
  }

  return ((activeUsers&&sessionId)  ? 
    (<div
      style={{
        position: 'fixed', right: '10px', bottom: '10px'
      }}
    >
      <div className="flex items-center">
        {
        createAvatarsFromJson(activeUsers)
        }
       
      </div>
    </div>):null
  )
}

export default SessionUsers;