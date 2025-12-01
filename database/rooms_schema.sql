-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_public BOOLEAN DEFAULT true
);

-- Create room_members table
CREATE TABLE IF NOT EXISTS room_members (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- Enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rooms
CREATE POLICY "Rooms are viewable by everyone"
  ON rooms FOR SELECT
  USING (true);

CREATE POLICY "Users can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their rooms"
  ON rooms FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their rooms"
  ON rooms FOR DELETE
  USING (auth.uid() = owner_id);

-- RLS Policies for room_members
CREATE POLICY "Room members are viewable by everyone"
  ON room_members FOR SELECT
  USING (true);

CREATE POLICY "Users can join rooms"
  ON room_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can leave or owner can kick"
  ON room_members FOR DELETE
  USING (
    auth.uid() = user_id -- Leaving
    OR
    EXISTS ( -- Owner kicking
      SELECT 1 FROM rooms
      WHERE rooms.id = room_id
      AND rooms.owner_id = auth.uid()
    )
  );
