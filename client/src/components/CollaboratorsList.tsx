import React, { useEffect, useState } from 'react';
import { Awareness } from 'y-protocols/awareness';
import { PresenceUser } from '@livedocs/shared';

interface CollaboratorsListProps {
  awareness: Awareness | null;
}

export const CollaboratorsList: React.FC<CollaboratorsListProps> = ({ awareness }) => {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!awareness) return;

    const updateUsers = () => {
      const states = awareness.getStates();
      const userList: PresenceUser[] = [];
      const seenIds = new Set<string>();

      states.forEach((state) => {
        if (state.user && !seenIds.has(state.user.id)) {
          seenIds.add(state.user.id);
          userList.push(state.user as PresenceUser);
        }
      });

      setUsers(userList);
    };

    updateUsers();
    awareness.on('change', updateUsers);

    return () => {
      awareness.off('change', updateUsers);
    };
  }, [awareness]);

  if (users.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center -space-x-1.5 overflow-hidden py-1">
      {users.map((user) => (
        <div
          key={user.id}
          className="relative inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-white text-white text-xs font-semibold shadow-xs hover:z-20 hover:scale-110 transition-transform cursor-pointer"
          style={{ backgroundColor: user.color }}
          title={`${user.name} (${user.email})`}
        >
          {user.name.charAt(0).toUpperCase()}
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border border-white rounded-full"></span>
        </div>
      ))}
    </div>
  );
};
