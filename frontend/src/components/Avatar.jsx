import React from 'react';
import Lantern from '../tour/Lantern';
import FramedAvatar from './FramedAvatar';

// The face of a person: their photo, their emoji, or the plain Waylit lantern for 🙂 (everyone starts with it).
// The waving lantern is drawn a little low in its picture, so the avatar CSS lifts it until its body is in the middle.
export function AvatarFace({ person, lantern = 22 }) {
  if (person?.avatar_url) return <img src={person.avatar_url} alt="" />;
  const emoji = person?.avatar ?? '🙂';
  return emoji === '🙂' ? <Lantern size={lantern} pose="hello" /> : emoji;
}

// A member's photo, their emoji avatar, or the Waylit lantern, in a small circle.
export default function Avatar({ person, className = 'person-avatar' }) {
  const content = <AvatarFace person={person} />;
  return (
    <FramedAvatar frame={person?.frame} small>
      <span className={className}>{content}</span>
    </FramedAvatar>
  );
}
