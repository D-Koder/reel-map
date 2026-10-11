import React from 'react';
import ReactDOM from 'react-dom/client';
import HomeScreen from '../src/components/HomeScreen';
import '../src/App.css';
window.log = [];
const members = [{ id: 'u1', display_name: 'You', avatar: '🦊' }, { id: 'u2', display_name: 'Sam', avatar: '🌸' }];
const collections = [{ id: 'c1', name: 'Date Night', emoji: '💕', members }];
const mk = (id, name) => ({ id, name, category: 'food', collection_id: 'c1', reactions: { u1: 'keen' }, created_at: '2026-10-01', reel_url: `https://www.instagram.com/reel/${id}/` });
const places = ['Little Spot BBQ', 'Melbourne Central', 'Tipo 00', 'Brunetti'].map((n, i) => mk('p' + i, n));
ReactDOM.createRoot(document.getElementById('root')).render(
  <div className="app" style={{ width: 390, height: 844 }}><main className="content"><section className="panel panel-home active">
    <HomeScreen userId="u1" places={places} collections={collections} membersOf={{ c1: members }} streak={0}
      onOpenPin={(id) => window.log.push(['open', id])} onReorder={(ids) => window.log.push(['reorder', ids.join(',')])}
      onAddPlace={() => {}} />
  </section></main></div>
);
