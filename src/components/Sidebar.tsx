import React from 'react';
import { Megaphone, Terminal, Users, Hash, Plus, Settings, LogOut } from 'lucide-react';
import { Channel, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { hasPermission } from '../lib/permissions';

interface SidebarProps {
  activeChannel: Channel;
  onChannelSelect: (channel: Channel) => void;
  channels: Channel[];
  onManageChannels: () => void;
  user: UserProfile;
  teamMembers: UserProfile[];
  onEditProfile: () => void;
  onLogout: () => void;
}

const StatusDot = ({ status, className }: { status?: 'online' | 'offline' | 'away', className?: string }) => {
  const color = status === 'online' ? 'bg-green-500' : status === 'away' ? 'bg-yellow-500' : 'bg-slate-500';
  const label = status === 'online' ? 'Online' : status === 'away' ? 'Away' : 'Offline';
  return (
    <div 
      className={cn("w-2 h-2 rounded-full", color, className)} 
      title={label}
    />
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ activeChannel, onChannelSelect, channels, onManageChannels, user, teamMembers, onEditProfile, onLogout }) => {
  const canManage = hasPermission(user.role, 'MANAGE_CHANNELS');

  return (
    <div className="w-64 bg-slate-900 text-slate-300 flex flex-col h-full border-r border-slate-800">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
            BB
          </div>
          <h1 className="font-bold text-white tracking-tight">BuddyBubble</h1>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 space-y-6">
        {/* Channels Section */}
        <div>
          <div className="px-4 mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Channels</span>
            {canManage && (
              <button 
                onClick={onManageChannels}
                className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition-colors"
                title="Manage Channels"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
          <nav className="space-y-0.5 px-2">
            <button
              onClick={() => onChannelSelect({ id: 'all', name: 'All Channels', icon: 'Hash' })}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                activeChannel.id === 'all'
                  ? "bg-indigo-600 text-white"
                  : "hover:bg-slate-800 hover:text-slate-100"
              )}
            >
              <Hash className="w-4 h-4 opacity-70" />
              All Channels
            </button>
            
            <div className="my-2 border-t border-slate-800/50 mx-2" />

            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => onChannelSelect(channel)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                  activeChannel.id === channel.id
                    ? "bg-indigo-600 text-white"
                    : "hover:bg-slate-800 hover:text-slate-100"
                )}
              >
                <Hash className="w-4 h-4 opacity-70" />
                {channel.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Team Members Section */}
        <div>
          <div className="px-4 mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Team Members</span>
            <Users className="w-3 h-3 text-slate-500" />
          </div>
          <div className="space-y-0.5 px-2">
            {teamMembers.filter(m => m.id !== user.id).map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-slate-800/50 transition-colors group"
              >
                <div className="relative">
                  <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-white overflow-hidden border border-slate-800">
                    {member.avatar ? (
                      <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      member.name.split(' ').map(n => n[0]).join('').toUpperCase()
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <p className="truncate text-slate-300 group-hover:text-white transition-colors">{member.name}</p>
                  <StatusDot status={member.status} className="shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 bg-slate-950 border-t border-slate-800 group">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium text-white overflow-hidden border-2 border-slate-800">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                user.name.split(' ').map(n => n[0]).join('').toUpperCase()
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white truncate">{user.name}</p>
              <StatusDot status={user.status || 'online'} className="shrink-0" />
            </div>
            <p className="text-[10px] text-slate-500 truncate uppercase tracking-wider font-bold">{user.role || 'Member'}</p>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={onEditProfile}
              className="p-1.5 hover:bg-slate-800 rounded-md text-slate-500 hover:text-white transition-all"
              title="Edit Profile"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onClick={onLogout}
              className="p-1.5 hover:bg-slate-800 rounded-md text-slate-500 hover:text-red-400 transition-all"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
