import React, { useState } from 'react';
import './HomeScreen.css';

export default function HomeScreen() {
  const [pins, setPins] = useState([
    {
      id: 1,
      name: 'Concert Next Week',
      emoji: '🎵',
      yourRating: 3,
      herRating: 3,
      section: 'do-soon',
    },
    {
      id: 2,
      name: 'Wine & Wild',
      emoji: '🍷',
      yourRating: 3,
      herRating: 3,
      section: 'do-soon',
    },
    {
      id: 3,
      name: 'Brunch Spot Carlton',
      emoji: '🥐',
      yourRating: 3,
      herRating: 3,
      section: 'do-soon',
    },
    {
      id: 4,
      name: 'Tech Festival',
      emoji: '🎉',
      yourRating: 1,
      herRating: 3,
      section: 'explore',
    },
  ]);

  const doSoonPins = pins.filter(p => p.section === 'do-soon');
  const explorePins = pins.filter(p => p.section === 'explore');
  const completedPins = pins.filter(p => p.section === 'completed');

  const getRatingEmoji = (level) => {
    const emojis = { 1: '😐', 2: '🤔', 3: '🔥' };
    return emojis[level] || '—';
  };

  const PinItem = ({ pin, onClick }) => (
    <div className="pin-item" onClick={onClick}>
      <div className="pin-thumbnail">{pin.emoji}</div>
      <div className="pin-info">
        <div className="pin-name">{pin.name}</div>
        <div className="pin-rating">
          {getRatingEmoji(pin.yourRating)}{getRatingEmoji(pin.herRating)}
          {pin.yourRating === pin.herRating && pin.yourRating === 3 ? ' Both in' : pin.yourRating !== pin.herRating ? ' Mixed vibes' : ''}
        </div>
      </div>
    </div>
  );

  return (
    <div className="home-screen">
      <div className="header">
        <span>🗺️ Reel Map</span>
        <button className="header-btn">⚙️</button>
      </div>

      {doSoonPins.length > 0 && (
        <div className="board-section">
          <div className="board-title">🔥 Do Soon ({doSoonPins.length}/5)</div>
          {doSoonPins.map(pin => (
            <PinItem key={pin.id} pin={pin} onClick={() => console.log('Clicked:', pin.name)} />
          ))}
        </div>
      )}

      {explorePins.length > 0 && (
        <div className="board-section">
          <div className="board-title">👥 Explore Together ({explorePins.length})</div>
          {explorePins.map(pin => (
            <PinItem key={pin.id} pin={pin} onClick={() => console.log('Clicked:', pin.name)} />
          ))}
        </div>
      )}

      {completedPins.length > 0 && (
        <div className="board-section">
          <div className="board-title">✅ Completed This Month</div>
          {completedPins.map(pin => (
            <PinItem key={pin.id} pin={pin} onClick={() => console.log('Clicked:', pin.name)} />
          ))}
        </div>
      )}

      <div className="streak">
        🔥 Streak: 2 adventures this month
      </div>
    </div>
  );
}