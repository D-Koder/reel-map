import React from 'react';
import Lantern from '../tour/Lantern';
import FramedAvatar from './FramedAvatar';

// The face of a person: their photo, their emoji, or the plain Waylit lantern for 🙂 (everyone starts with it).
// The plain lantern is symmetrical, so it sits in the middle of its circle (the waving one leans to one side).
export function AvatarFace({ person, lantern = 22 }) {
  if (person?.avatar_url) return <img src={person.avatar_url} alt="" />;
  const emoji = person?.avatar ?? '🙂';
  return emoji === '🙂' ? <Lantern size={lantern} /> : emoji;
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
