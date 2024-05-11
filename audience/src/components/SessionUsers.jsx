import { mergeProps, useLongPress, usePress } from 'react-aria';
import { Button } from "@/components/ui/button"
import { useState, useContext, useEffect } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const CDN = `https://cdn.discordapp.com`
const SIZE = 256

const queryParams = new URLSearchParams(window.location.search);
const isEmbedded = queryParams.get('frame_id') != null;

function SessionUsers() {
  const { userData, sharingUser, activeUsers } = useContext(DataContext).data;

  function getAvatarUrl(user) {
    if (user.discordData.avatar != null) {
      return `${CDN}/avatars/${user.discordData.id}/${user.discordData.avatar}.png?size=${SIZE}`;
    } else {
      const defaultAvatarIndex = (BigInt(user.discordData.id) >> 22n) % 6n;
      return `${CDN}/embed/avatars/${defaultAvatarIndex}.png?size=${SIZE}`;
    }
  }

  function createAvatarsFromJson(activeUsers) {
    return activeUsers.map(user => (
      <Avatar className="" style={{ transition: "all 0.2s", 
                                    filter: user.user === sharingUser ? 'brightness(100%)' : 'brightness(50%)',
                                    marginLeft: user.user === sharingUser ? '0.6rem' : '-0.3rem',
                                    marginRight: user.user === sharingUser ? '0.6rem' : '-0.3rem' }}>
        {isEmbedded ? <AvatarImage src={getAvatarUrl(user)} /> : <AvatarFallback>?</AvatarFallback>}
      </Avatar>
    ));
  }

  return (!activeUsers ? null :
    (<div
      style={{
        position: 'fixed', right: '10px', bottom: '10px'
      }}
    >
      <div className="flex items-center">
        {createAvatarsFromJson(activeUsers)}
      </div>
    </div>)
  )
}

export default SessionUsers;