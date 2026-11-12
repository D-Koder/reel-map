import React from 'react';
import Lantern from '../tour/Lantern';

// A member's photo, their emoji avatar, or the Waylit lantern for the plain 🙂 (everyone starts with it).
export default function Avatar({ person, className = 'person-avatar' }) {
  let content = person?.avatar ?? '🙂';
  if (person?.avatar_url) content = <img src={person.avatar_url} alt="" />;
  else if (content === '🙂') content = <Lantern size={22} pose="hello" />;
  return <span className={className}>{content}</span>;
}
