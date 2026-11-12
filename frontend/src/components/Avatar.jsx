import React from 'react';
import { DEFAULT_AVATAR_URL } from '../lib/constants';
import FramedAvatar from './FramedAvatar';

// A member's photo, their emoji avatar, or the default picture for the plain 🙂.
export default function Avatar({ person, className = 'person-avatar' }) {
  let content = person?.avatar ?? '🙂';
  if (person?.avatar_url) content = <img src={person.avatar_url} alt="" />;
  else if (content === '🙂') content = <img src={DEFAULT_AVATAR_URL} alt="" />;
  return (
    <FramedAvatar frame={person?.frame} small>
      <span className={className}>{content}</span>
    </FramedAvatar>
  );
}
