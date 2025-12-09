import React from 'react';
import Placeholder from './Placeholder';

export default function Games() {
  return (
    <Placeholder
      title="Games"
      description="Collection of cognitive games. Play Memory Match, Stroop Test and more."
      links={[{ to: '/games/memory', label: 'Memory Match' }, { to: '/games/stroop', label: 'Stroop Test' }]}
    />
  );
}
