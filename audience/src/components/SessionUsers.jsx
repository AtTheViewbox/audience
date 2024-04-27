import { mergeProps, useLongPress, usePress } from 'react-aria';
import { Button } from "@/components/ui/button"
import { useState, useContext, useEffect } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
const CDN = `https://cdn.discordapp.com`
const SIZE = 256

function SessionUsers() {
  const { userData, sharingUser, activeUsers } = useContext(DataContext).data;
  
  function getAvatarUrl(user) {
    if (user.discordData.avatar != null) {
      return (`${CDN}/avatars/${user.discordData.id}/${user.discordData.avatar}.png?size=${SIZE}`);
    } else {
      const defaultAvatarIndex = (BigInt(user.discordData.id) >> 22n) % 6n;
      return `${CDN}/embed/avatars/${defaultAvatarIndex}.png?size=${SIZE}`;
    }

  }

  function createAvatarsFromJson(activeUsers) {
    return activeUsers.map(user => (

      <Avatar className="">
        <AvatarImage src={getAvatarUrl(user)} />
        {/* <AvatarFallback style={{backgroundColor: 'blue'}}>?</AvatarFallback> */}
        {/*  <AvatarFallback>?</AvatarFallback> */}
      </Avatar>
    ));
  }

  return (!activeUsers ? null :
    (<div
      style={{
        position: 'fixed', right: '10px', bottom: '10px'
      }}
    >
      <div className="flex items-center -space-x-2 *:ring *:ring-white">
        {createAvatarsFromJson(activeUsers)}

      </div>
    </div>)
  )
}

export default SessionUsers;