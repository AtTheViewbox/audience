import { mergeProps, useLongPress, usePress } from 'react-aria';
import { Button } from "@/components/ui/button"
import { useState, useContext } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function SessionUsers() {
  const { userData, sharingUser, sessionUserState } = useContext(DataContext).data;

  function createAvatarsFromJson(jsonData) {
    return jsonData.map(item => (
      <Avatar className="">
        {/* <AvatarImage src={`https://github.com/${item.user}.png`} /> */}
        {/* <AvatarFallback style={{backgroundColor: 'blue'}}>?</AvatarFallback> */}
        <AvatarFallback>?</AvatarFallback>
      </Avatar>
    ));
  }
  
  return (!sessionUserState ? null :
    (<div
      style={{
        position: 'fixed', right: '10px', bottom: '10px'
      }}
    >
      <div className="flex items-center -space-x-2 *:ring *:ring-white">
        {createAvatarsFromJson(sessionUserState)}
      </div>
    </div>)
  )
}

export default SessionUsers;