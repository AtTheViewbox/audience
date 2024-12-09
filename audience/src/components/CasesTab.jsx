import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"


const songs = [
  { id: 1, title: "Bohemian Rhapsody", artist: "Queen", duration: "5:55" },
  { id: 2, title: "Stairway to Heaven", artist: "Led Zeppelin", duration: "8:02" },
  { id: 3, title: "Imagine", artist: "John Lennon", duration: "3:01" },
  { id: 4, title: "Smells Like Teen Spirit", artist: "Nirvana", duration: "5:01" },
  { id: 5, title: "Billie Jean", artist: "Michael Jackson", duration: "4:54" },
  { id: 1, title: "Bohemian Rhapsody", artist: "Queen", duration: "5:55" },
  { id: 2, title: "Stairway to Heaven", artist: "Led Zeppelin", duration: "8:02" },
  { id: 3, title: "Imagine", artist: "John Lennon", duration: "3:01" },
  { id: 4, title: "Smells Like Teen Spirit", artist: "Nirvana", duration: "5:01" },

]

export default function CasesTab() {
    const [newSong, setNewSong] = useState({ title: '', artist: '', duration: '' })

  const handleSongClick = () => {
    console.log(`Song clicked: ${song.title}`)
    // Here you can add logic to play the song, navigate to a details page, etc.
  }

  const handleInputChange = () => {
    const { name, value } = e.target
    setNewSong(prev => ({ ...prev, [name]: value }))
  }

  const handleAddSong = () => {
    e.preventDefault()
    if (newSong.title && newSong.artist && newSong.duration) {
      setSongs(prev => [...prev, { ...newSong, id: prev.length + 1 }])
      setNewSong({ title: '', artist: '', duration: '' })
    }
  }

  return (
    <Card className="w-full max-w-md">
    <CardHeader>
      <CardTitle>Saved Cases</CardTitle>
    </CardHeader>
    <CardContent>
      <ScrollArea className="h-[300px] mb-4 rounded-md border">
        <div className="p-4">
          {songs.map((song) => (
            <Button
              key={song.id}
              variant="ghost"
              className="w-full justify-start text-left hover:bg-secondary mb-2"
              onClick={() => handleSongClick(song)}
            >
              <div className="flex w-full items-center space-x-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{song.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{song.artist}</p>
                </div>
                <div className="shrink-0 text-sm text-muted-foreground">{song.duration}</div>
              </div>
            </Button>
          ))}
        </div>
      </ScrollArea>
      <form onSubmit={handleAddSong} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Song Title</Label>
          <Input
            id="title"
            name="title"
            value={newSong.title}
            onChange={handleInputChange}
            placeholder="Enter song title"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="artist">Artist</Label>
          <Input
            id="artist"
            name="artist"
            value={newSong.artist}
            onChange={handleInputChange}
            placeholder="Enter artist name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">Duration</Label>
          <Input
            id="duration"
            name="duration"
            value={newSong.duration}
            onChange={handleInputChange}
            placeholder="Enter song duration (e.g., 3:45)"
            required
          />
        </div>
        <Button type="submit" className="w-full">Add Song</Button>
      </form>
    </CardContent>
  </Card>
  )
}