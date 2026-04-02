import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, Save, Hash, AlertCircle } from 'lucide-react';
import { Channel, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { hasPermission } from '../lib/permissions';

interface ManageChannelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  onAddChannel: (name: string) => void;
  onUpdateChannel: (id: string, name: string) => void;
  onDeleteChannel: (id: string) => void;
  user: UserProfile;
}

export const ManageChannelsModal: React.FC<ManageChannelsModalProps> = ({ 
  isOpen, 
  onClose, 
  channels, 
  onAddChannel, 
  onUpdateChannel, 
  onDeleteChannel,
  user
}) => {
  const [newChannelName, setNewChannelName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const canManage = hasPermission(user.role, 'MANAGE_CHANNELS');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newChannelName.trim() && canManage) {
      onAddChannel(newChannelName.trim());
      setNewChannelName('');
    }
  };

  const startEditing = (channel: Channel) => {
    setEditingId(channel.id);
    setEditingName(channel.name);
  };

  const saveEdit = () => {
    if (editingId && editingName.trim() && canManage) {
      onUpdateChannel(editingId, editingName.trim());
      setEditingId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">Manage Channels</h3>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar">
              {!canManage && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl mb-6">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <p className="text-xs text-amber-700 font-medium">
                    You don't have permission to manage channels.
                  </p>
                </div>
              )}

              {canManage && (
                <form onSubmit={handleAdd} className="mb-8">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Add New Channel</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        placeholder="Channel name..."
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!newChannelName.trim()}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Existing Channels</label>
                {channels.map((channel) => (
                  <div 
                    key={channel.id} 
                    className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl group hover:border-indigo-200 transition-all"
                  >
                    <Hash className="w-4 h-4 text-slate-400" />
                    {editingId === channel.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        className="flex-1 bg-white border border-indigo-500 rounded px-2 py-1 text-sm focus:outline-none"
                      />
                    ) : (
                      <span className="flex-1 text-sm font-medium text-slate-700">{channel.name}</span>
                    )}
                    
                    {canManage && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {editingId === channel.id ? (
                          <button
                            onClick={saveEdit}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => startEditing(channel)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteChannel(channel.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          disabled={channels.length <= 1}
                          title={channels.length <= 1 ? "Cannot delete the last channel" : "Delete Channel"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-white border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
