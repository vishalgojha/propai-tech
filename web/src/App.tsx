import React, { useState } from 'react';
import { 
  LayoutDashboard, PenTool, CheckCircle, Activity, MessageCircle, 
  UserCheck, Bot, Send, List, Play, Settings, HeartPulse, Database, 
  Server, Zap, Clock, Users, AlertTriangle, RefreshCw, Plus, Trash2 
} from 'lucide-react';

type Screen = 
  | 'dashboard' 
  | 'publish-studio' 
  | 'publish-results' 
  | 'portal-status' 
  | 'whatsapp-connect' 
  | 'pairing-approval' 
  | 'approvals-queue' 
  | 'agent-session' 
  | 'session-list' 
  | 'group-intake' 
  | 'group-queue' 
  | 'dispatch-center' 
  | 'connectors-center' 
  | 'wacli-tools' 
  | 'queue-runtime' 
  | 'properties' 
  | 'system-health' 
  | 'settings';

interface PublishResult {
  id: string;
  date: string;
  listingTitle: string;
  portal: '99acres' | 'MagicBricks' | 'Both';
  externalId: string;
  status: 'success' | 'failed';
  reason?: string;
}

interface Connector {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'error';
  lastPing: string;
  special?: boolean;
}

interface QueueItem {
  id: string;
  kind: string;
  priority: 'high' | 'medium' | 'low';
  content: string;
  targets: string;
  status: 'queued' | 'processing' | 'sent' | 'failed';
  scheduled: string;
}

export const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');
  const [publishResults, setPublishResults] = useState<PublishResult[]>([
    { id: 'PR-7842', date: 'Feb 24, 14:32', listingTitle: '3BHK Bandra West', portal: '99acres', externalId: '99A-938472', status: 'success' },
    { id: 'PR-7841', date: 'Feb 24, 13:19', listingTitle: '2BHK Andheri', portal: 'MagicBricks', externalId: 'MB-837462', status: 'success' },
    { id: 'PR-7840', date: 'Feb 24, 11:05', listingTitle: '4BHK Powai', portal: 'Both', externalId: '99A-837291 / MB-291837', status: 'failed', reason: 'Rate limit exceeded' },
  ]);

  const [connectors, setConnectors] = useState<Connector[]>([
    { id: 'openrouter', name: 'OpenRouter', status: 'healthy', lastPing: '12s ago' },
    { id: 'ollama', name: 'Ollama', status: 'healthy', lastPing: '41s ago' },
    { id: 'wacli', name: 'WACLI', status: 'healthy', lastPing: 'just now' },
    { id: 'wppconnect', name: 'WPPConnect Legacy', status: 'warning', lastPing: '3m ago' },
    { id: 'propai', name: 'PropAI Live Bridge', status: 'healthy', lastPing: '8s ago', special: true },
    { id: 'postgres', name: 'PostgreSQL Store', status: 'healthy', lastPing: '19s ago' },
    { id: 'openclaw', name: 'OpenClaw Gateway', status: 'healthy', lastPing: '1m ago' },
  ]);

  const [propaiEnv] = useState({
    PROPAI_LIVE_99ACRES_POST_URL: { value: 'https://api.propai.live/99acres/post', ready: true },
    PROPAI_LIVE_MAGICBRICKS_POST_URL: { value: 'https://api.propai.live/magicbricks/post', ready: true },
    PROPAI_LIVE_API_KEY: { value: 'sk-live-••••••••••••••••••', ready: true },
  });

  const [queueItems, setQueueItems] = useState<QueueItem[]>([
    { id: 'GQ-3921', kind: 'property', priority: 'high', content: 'Luxury 4BHK in Worli', targets: 'Group-Mumbai-Premium', status: 'queued', scheduled: 'Now' },
    { id: 'GQ-3920', kind: 'property', priority: 'medium', content: '2BHK Andheri East', targets: 'Group-Thane', status: 'processing', scheduled: '15:00' },
  ]);

  const [formData, setFormData] = useState({
    title: '3BHK Sea Facing in Bandra West',
    description: 'Spacious 3 bedroom apartment with sea view, 1450 sq ft, 2 parking, 24x7 security.',
    price: '2.85',
    location: 'Bandra West, Mumbai',
    portals: ['99acres', 'MagicBricks'] as ('99acres' | 'MagicBricks')[],
    dryRun: false,
  });

  const [activeWacliTab, setActiveWacliTab] = useState<'send' | 'search' | 'chats' | 'doctor'>('send');
  const [wacliOutput, setWacliOutput] = useState('');
  const [currentAgentSession, setCurrentAgentSession] = useState([
    { role: 'user', text: 'Create listing for 3BHK Bandra' },
    { role: 'agent', text: 'Draft ready. Selected portals: 99acres + MagicBricks. Dry-run: false.' },
    { role: 'system', text: 'post_to_99acres tool called → 99A-938472' },
    { role: 'system', text: 'post_to_magicbricks tool called → MB-837462' },
  ]);

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'publish-studio' as const, label: 'Listing Publish Studio', icon: PenTool },
    { id: 'publish-results' as const, label: 'Publish Results', icon: CheckCircle },
    { id: 'portal-status' as const, label: 'Portal Adapter Status', icon: Activity },
    { id: 'whatsapp-connect' as const, label: 'WhatsApp Connect', icon: MessageCircle },
    { id: 'pairing-approval' as const, label: 'Pairing Approval', icon: UserCheck },
    { id: 'approvals-queue' as const, label: 'Approvals Queue', icon: Clock },
    { id: 'agent-session' as const, label: 'Agent Session', icon: Bot },
    { id: 'session-list' as const, label: 'Session List', icon: List },
    { id: 'group-intake' as const, label: 'Group Posting Intake', icon: Plus },
    { id: 'group-queue' as const, label: 'Group Posting Queue', icon: Send },
    { id: 'dispatch-center' as const, label: 'Dispatch Center', icon: Play },
    { id: 'connectors-center' as const, label: 'Connectors Center', icon: Server },
    { id: 'wacli-tools' as const, label: 'WACLI Tools', icon: Zap },
    { id: 'queue-runtime' as const, label: 'Queue Runtime', icon: Database },
    { id: 'properties' as const, label: 'Properties / Inventory', icon: Plus },
    { id: 'system-health' as const, label: 'System Health & Webhook', icon: HeartPulse },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ] as const;

  const handlePublish = () => {
    const newResult: PublishResult = {
      id: `PR-${Math.floor(Math.random() * 9000) + 1000}`,
      date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date()),
      listingTitle: formData.title,
      portal: formData.portals.length === 2 ? 'Both' : formData.portals[0] === '99acres' ? '99acres' : 'MagicBricks',
      externalId: `99A-${Math.floor(Math.random() * 900000)}`,
      status: Math.random() > 0.15 ? 'success' : 'failed',
      reason: Math.random() > 0.85 ? 'API timeout' : undefined,
    };
    setPublishResults([newResult, ...publishResults]);
    setActiveScreen('publish-results');

    setCurrentAgentSession(prev => [
      ...prev,
      { role: 'system', text: `post_to_${formData.portals.includes('99acres') ? '99acres' : 'magicbricks'} tool called → ${newResult.externalId}` }
    ]);
  };

  const testConnector = (id: string) => {
    setConnectors(prev => prev.map(c => 
      c.id === id ? { ...c, status: 'healthy', lastPing: 'just now' } : c
    ));
    alert(`✅ ${connectors.find(c => c.id === id)?.name} connection tested successfully`);
  };

  const approvePairing = (id: string) => {
    alert(`✅ Pairing code ${id} approved`);
  };

  const addToQueue = () => {
    const newItem: QueueItem = {
      id: `GQ-${Math.floor(Math.random() * 9000) + 1000}`,
      kind: 'property',
      priority: 'high',
      content: 'New luxury listing added from studio',
      targets: 'Group-Mumbai-Premium, Group-Thane',
      status: 'queued',
      scheduled: 'Now',
    };
    setQueueItems([newItem, ...queueItems]);
    setActiveScreen('group-queue');
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-6 border-b border-zinc-800 flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-600 rounded-2xl flex items-center justify-center text-xl font-bold">P</div>
          <div>
            <div className="font-semibold text-2xl tracking-tighter">PropAI Sync</div>
            <div className="text-[10px] text-zinc-500 -mt-1">REALTY BRIDGE v2.4.1</div>
          </div>
        </div>

        <div className="px-3 py-6 flex-1 overflow-y-auto">
          <div className="text-xs font-medium text-zinc-500 px-3 mb-2">CORE</div>
          {navItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-3xl text-sm font-medium transition-all ${activeScreen === item.id 
                  ? 'bg-zinc-800 text-white shadow-inner' 
                  : 'hover:bg-zinc-800/50 text-zinc-400'}`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}

          <div className="h-px bg-zinc-800 my-6 mx-3" />

          <div className="text-xs font-medium text-zinc-500 px-3 mb-2">WHATSAPP &amp; AGENTS</div>
          {navItems.slice(4, 9).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-3xl text-sm font-medium transition-all ${activeScreen === item.id 
                  ? 'bg-zinc-800 text-white shadow-inner' 
                  : 'hover:bg-zinc-800/50 text-zinc-400'}`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}

          <div className="h-px bg-zinc-800 my-6 mx-3" />

          <div className="text-xs font-medium text-zinc-500 px-3 mb-2">GROUP &amp; DISPATCH</div>
          {navItems.slice(9, 13).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-3xl text-sm font-medium transition-all ${activeScreen === item.id 
                  ? 'bg-zinc-800 text-white shadow-inner' 
                  : 'hover:bg-zinc-800/50 text-zinc-400'}`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}

          <div className="h-px bg-zinc-800 my-6 mx-3" />

          <div className="text-xs font-medium text-zinc-500 px-3 mb-2">INFRASTRUCTURE</div>
          {navItems.slice(13).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-3xl text-sm font-medium transition-all ${activeScreen === item.id 
                  ? 'bg-zinc-800 text-white shadow-inner' 
                  : 'hover:bg-zinc-800/50 text-zinc-400'}`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-zinc-950">
        <div className="p-8">
          {activeScreen === 'dashboard' && (
            <div className="space-y-8">
              <div className="text-3xl font-semibold">Dashboard</div>
              <div className="grid grid-cols-4 gap-6">
                <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
                  <div className="text-sm text-zinc-400 mb-2">Total Listings Published</div>
                  <div className="text-4xl font-bold">1,247</div>
                  <div className="text-xs text-emerald-400 mt-4">↑ 12% this month</div>
                </div>
                <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
                  <div className="text-sm text-zinc-400 mb-2">Success Rate</div>
                  <div className="text-4xl font-bold">98.7%</div>
                  <div className="text-xs text-emerald-400 mt-4">7 failed today</div>
                </div>
                <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
                  <div className="text-sm text-zinc-400 mb-2">Active Connectors</div>
                  <div className="text-4xl font-bold">7/7</div>
                  <div className="text-xs text-emerald-400 mt-4">All healthy</div>
                </div>
                <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
                  <div className="text-sm text-zinc-400 mb-2">Queue Depth</div>
                  <div className="text-4xl font-bold">42</div>
                  <div className="text-xs text-amber-400 mt-4">2 processing</div>
                </div>
              </div>
              <button onClick={() => setActiveScreen('publish-studio')} className="mt-8 px-8 py-4 bg-emerald-600 rounded-3xl font-medium hover:bg-emerald-700 transition-colors">
                Create New Listing →
              </button>
            </div>
          )}

          {activeScreen === 'publish-studio' && (
            <div className="space-y-8">
              <div className="text-3xl font-semibold">Listing Publish Studio</div>
              <div className="grid grid-cols-3 gap-8">
                {/* Left: Form */}
                <div className="col-span-2 space-y-6">
                  <div className="bg-zinc-900 rounded-3xl p-8 space-y-6">
                    <div>
                      <label className="block text-sm font-medium mb-3">Listing Title</label>
                      <input 
                        type="text" 
                        value={formData.title}
                        onChange={(e) => setFormData({...formData, title: e.target.value})}
                        className="w-full bg-zinc-800 rounded-3xl py-4 px-6 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-3">Description</label>
                      <textarea 
                        value={formData.description}
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                        className="w-full bg-zinc-800 rounded-3xl py-4 px-6 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 h-32"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-3">Price (Cr)</label>
                        <input 
                          type="text" 
                          value={formData.price}
                          onChange={(e) => setFormData({...formData, price: e.target.value})}
                          className="w-full bg-zinc-800 rounded-3xl py-4 px-6 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-3">Location</label>
                        <input 
                          type="text" 
                          value={formData.location}
                          onChange={(e) => setFormData({...formData, location: e.target.value})}
                          className="w-full bg-zinc-800 rounded-3xl py-4 px-6 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-3">Publish to Portals</label>
                      <div className="flex gap-4">
                        {(['99acres', 'MagicBricks'] as const).map(portal => (
                          <label key={portal} className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={formData.portals.includes(portal)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({...formData, portals: [...formData.portals, portal]});
                                } else {
                                  setFormData({...formData, portals: formData.portals.filter(p => p !== portal)});
                                }
                              }}
                              className="w-4 h-4"
                            />
                            <span className="text-sm">{portal}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={formData.dryRun}
                        onChange={(e) => setFormData({...formData, dryRun: e.target.checked})}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Dry-run (preview only)</span>
                    </label>
                    <button 
                      onClick={handlePublish}
                      className="w-full py-4 bg-emerald-600 rounded-3xl font-medium hover:bg-emerald-700 transition-colors"
                    >
                      Publish Listing
                    </button>
                  </div>
                </div>

                {/* Right: Agent Session Flow */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col h-fit">
                  <div className="uppercase text-xs tracking-[2px] text-zinc-500 mb-4">LIVE AGENT SESSION #AS-3921</div>
                  
                  <div className="flex-1 space-y-6 overflow-auto pr-2 max-h-96">
                    {currentAgentSession.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        <div className={`max-w-[85%] px-5 py-3 rounded-3xl text-sm ${msg.role === 'user' ? 'bg-emerald-600' : msg.role === 'agent' ? 'bg-zinc-800' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'}`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-center text-zinc-500 mt-4">Uses post_to_99acres + post_to_magicbricks tools</div>
                </div>
              </div>
            </div>
          )}

          {activeScreen === 'publish-results' && (
            <div>
              <div className="flex justify-between items-center mb-8">
                <div className="text-2xl font-semibold">Publish History</div>
                <div className="flex gap-3">
                  <button className="px-6 py-3 bg-zinc-800 rounded-3xl text-sm hover:bg-zinc-700 transition-colors">All Portals</button>
                  <button className="px-6 py-3 bg-zinc-800 rounded-3xl text-sm hover:bg-zinc-700 transition-colors">Today</button>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-3xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-6 px-8 text-xs uppercase tracking-widest text-zinc-500">Date</th>
                      <th className="text-left py-6 px-8 text-xs uppercase tracking-widest text-zinc-500">Listing</th>
                      <th className="text-left py-6 px-8 text-xs uppercase tracking-widest text-zinc-500">Portal</th>
                      <th className="text-left py-6 px-8 text-xs uppercase tracking-widest text-zinc-500">External ID</th>
                      <th className="text-left py-6 px-8 text-xs uppercase tracking-widest text-zinc-500">Status</th>
                      <th className="w-40"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {publishResults.map(result => (
                      <tr key={result.id} className="hover:bg-zinc-800/50 transition-colors">
                        <td className="py-6 px-8 text-sm text-zinc-400">{result.date}</td>
                        <td className="py-6 px-8 font-medium">{result.listingTitle}</td>
                        <td className="py-6 px-8">
                          <span className={`inline-block px-4 py-1 text-xs rounded-3xl ${result.portal === 'Both' ? 'bg-purple-500/20 text-purple-400' : result.portal === '99acres' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {result.portal}
                          </span>
                        </td>
                        <td className="py-6 px-8 font-mono text-sm text-zinc-400">{result.externalId}</td>
                        <td className="py-6 px-8">
                          {result.status === 'success' ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-400 text-sm">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full" /> Success
                            </span>
                          ) : (
                            <span className="text-red-400 text-sm">{result.reason}</span>
                          )}
                        </td>
                        <td className="py-6 px-8">
                          <button 
                            onClick={() => alert('🔄 Retry initiated for ' + result.id)}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-6 py-2 rounded-3xl transition-colors"
                          >
                            Retry
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeScreen === 'portal-status' && (
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="text-3xl font-semibold mb-2">PropAI Live Bridge • Adapter Status</div>
              <div className="text-zinc-400">99acres + MagicBricks real-time adapters</div>

              {/* 99acres Adapter */}
              <div className="bg-zinc-900 rounded-3xl p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl">🇮🇳</div>
                    <div>
                      <div className="text-2xl font-semibold">99acres Adapter</div>
                      <div className="text-emerald-400 text-sm">PROPAI_LIVE_99ACRES_POST_URL</div>
                    </div>
                  </div>
                  <div className="px-8 py-3 bg-emerald-500/10 text-emerald-400 rounded-3xl text-sm font-medium">CONNECTED • 99.8% uptime</div>
                </div>
                <div className="font-mono text-sm bg-black/50 p-5 rounded-2xl border border-zinc-800">
                  {propaiEnv.PROPAI_LIVE_99ACRES_POST_URL.value}
                </div>
              </div>

              {/* MagicBricks Adapter */}
              <div className="bg-zinc-900 rounded-3xl p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl">🏠</div>
                    <div>
                      <div className="text-2xl font-semibold">MagicBricks Adapter</div>
                      <div className="text-emerald-400 text-sm">PROPAI_LIVE_MAGICBRICKS_POST_URL</div>
                    </div>
                  </div>
                  <div className="px-8 py-3 bg-emerald-500/10 text-emerald-400 rounded-3xl text-sm font-medium">CONNECTED • 99.9% uptime</div>
                </div>
                <div className="font-mono text-sm bg-black/50 p-5 rounded-2xl border border-zinc-800">
                  {propaiEnv.PROPAI_LIVE_MAGICBRICKS_POST_URL.value}
                </div>
              </div>

              {/* Live API Key Readiness */}
              <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-emerald-500/30 rounded-3xl p-8">
                <div className="uppercase text-xs tracking-widest mb-1">PROPAI_LIVE_API_KEY</div>
                <div className="font-mono text-lg break-all">{propaiEnv.PROPAI_LIVE_API_KEY.value}</div>
                <div className="mt-6 flex items-center gap-2 text-emerald-400">
                  <div className="w-4 h-4 bg-emerald-500 rounded-full" /> Fully ready for both adapters
                </div>
              </div>
            </div>
          )}

          {activeScreen === 'connectors-center' && (
            <div>
              <div className="text-3xl font-semibold mb-10">All Connectors (7)</div>
              <div className="grid grid-cols-3 gap-6">
                {connectors.map(connector => (
                  <div key={connector.id} className={`bg-zinc-900 rounded-3xl p-8 transition-all hover:-translate-y-1 ${connector.special ? 'ring-2 ring-offset-4 ring-offset-zinc-950 ring-emerald-500' : ''}`}>
                    <div className="flex justify-between">
                      <div className="text-2xl font-medium">{connector.name}</div>
                      <div className={`px-5 py-1 text-xs rounded-3xl font-medium ${connector.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-400' : connector.status === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                        {connector.status.toUpperCase()}
                      </div>
                    </div>
                    <div className="mt-8 text-xs text-zinc-500">Last healthy ping</div>
                    <div className="text-4xl font-mono tracking-tighter text-white/70">{connector.lastPing}</div>
                    
                    {connector.special && (
                      <div className="mt-6 text-[10px] text-emerald-400">• Explicit 99acres &amp; MagicBricks support</div>
                    )}

                    <button 
                      onClick={() => testConnector(connector.id)}
                      className="mt-10 w-full py-4 border border-zinc-700 hover:border-white rounded-3xl text-sm transition-colors"
                    >
                      TEST CONNECTION
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeScreen === 'whatsapp-connect' && (
            <div className="max-w-md mx-auto bg-zinc-900 rounded-3xl p-10 text-center">
              <div className="mx-auto w-24 h-24 bg-emerald-600/10 rounded-full flex items-center justify-center mb-8">
                <MessageCircle className="w-12 h-12 text-emerald-400" />
              </div>
              <div className="text-3xl font-semibold mb-2">WhatsApp Connected</div>
              <div className="text-emerald-400 mb-8">WACLI + WPPConnect Legacy</div>
              <button className="w-full py-5 bg-emerald-600 rounded-3xl font-medium hover:bg-emerald-700 transition-colors">Refresh Connection</button>
              <div className="mt-12 text-xs text-left space-y-6">
                <div>✅ Multi-device support active</div>
                <div>✅ Webhook verified at /whatsapp/webhook</div>
                <div>✅ 142 active sessions</div>
              </div>
            </div>
          )}

          {activeScreen === 'pairing-approval' && (
            <div className="bg-zinc-900 rounded-3xl p-8 max-w-2xl mx-auto">
              <div className="text-xl font-medium mb-6">Pending Pairing Codes</div>
              {['PA-8372', 'PA-8371'].map(code => (
                <div key={code} className="flex justify-between items-center py-6 border-b border-zinc-800 last:border-0">
                  <div>{code}</div>
                  <button onClick={() => approvePairing(code)} className="bg-emerald-600 px-8 py-3 rounded-3xl text-sm hover:bg-emerald-700 transition-colors">Approve</button>
                </div>
              ))}
            </div>
          )}

          {activeScreen === 'approvals-queue' && (
            <div className="text-center text-5xl text-zinc-600 font-light py-32">Approvals Queue UI<br />(bulk approve/deny ready)</div>
          )}

          {activeScreen === 'agent-session' && (
            <div className="bg-zinc-900 rounded-3xl p-8 max-w-2xl">
              <div className="font-mono text-xs mb-4 text-emerald-400">CURRENT SESSION THREAD</div>
              {currentAgentSession.map((m,i) => <div key={i} className="mb-4 text-sm">{m.text}</div>)}
              <button onClick={() => setActiveScreen('publish-studio')} className="mt-8 text-emerald-400 hover:text-emerald-300 transition-colors">Back to Studio →</button>
            </div>
          )}

          {activeScreen === 'session-list' && <div className="text-4xl text-center py-40 text-zinc-700">All Agent Sessions (list + open detail)</div>}

          {activeScreen === 'group-intake' && (
            <div className="max-w-lg mx-auto bg-zinc-900 rounded-3xl p-10 space-y-8">
              <input placeholder="Content" className="w-full bg-zinc-800 rounded-3xl py-5 px-7 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" defaultValue="3BHK premium listing" />
              <select className="w-full bg-zinc-800 rounded-3xl py-5 px-7 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option>property</option>
              </select>
              <button onClick={addToQueue} className="w-full py-5 bg-emerald-600 rounded-3xl font-medium hover:bg-emerald-700 transition-colors">Add to Queue</button>
            </div>
          )}

          {activeScreen === 'group-queue' && (
            <div className="bg-zinc-900 rounded-3xl">
              <div className="flex border-b border-zinc-800">
                {(['queued','processing','sent','failed'] as const).map(s => (
                  <button key={s} className={`flex-1 py-5 text-sm font-medium transition-colors ${queueItems[0]?.status === s ? 'border-b-2 border-white' : 'text-zinc-400'}`}>
                    {s.toUpperCase()} ({queueItems.filter(i => i.status === s).length})
                  </button>
                ))}
              </div>
              {queueItems.map(item => (
                <div key={item.id} className="p-8 border-b border-zinc-800 flex justify-between items-center">
                  <div>{item.content}</div>
                  <button onClick={() => alert('Requeued')} className="text-xs px-6 py-2 border border-zinc-700 rounded-3xl hover:border-white transition-colors">REQUEUE</button>
                </div>
              ))}
            </div>
          )}

          {activeScreen === 'dispatch-center' && (
            <div className="max-w-md mx-auto text-center py-20">
              <button onClick={() => alert('🚀 Manual dispatch triggered')} className="bg-white text-xl text-black px-16 py-8 rounded-3xl font-semibold hover:bg-zinc-100 transition-colors">RUN MANUAL DISPATCH NOW</button>
              <div className="mt-16 text-zinc-500">Last scheduler run: 11 minutes ago</div>
            </div>
          )}

          {activeScreen === 'wacli-tools' && (
            <div>
              <div className="flex border-b border-zinc-700 mb-8">
                {(['send','search','chats','doctor'] as const).map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveWacliTab(tab)}
                    className={`px-10 py-5 font-medium border-b-2 transition-colors ${activeWacliTab === tab ? 'border-white' : 'border-transparent text-zinc-400'}`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
              {activeWacliTab === 'send' && (
                <div className="max-w-lg">
                  <input placeholder="+91 phone or group ID" className="w-full rounded-3xl py-6 px-8 bg-zinc-900 mb-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <textarea placeholder="Message..." className="w-full h-52 rounded-3xl py-6 px-8 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <button onClick={() => setWacliOutput('✅ Sent via WACLI')} className="mt-6 w-full py-6 bg-emerald-600 rounded-3xl hover:bg-emerald-700 transition-colors">SEND VIA WACLI</button>
                  {wacliOutput && <div className="mt-6 text-emerald-400 text-center font-medium">{wacliOutput}</div>}
                </div>
              )}
            </div>
          )}

          {activeScreen === 'queue-runtime' && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-12 max-w-lg mx-auto text-center">
              <div className="text-6xl mb-6">✅</div>
              <div className="text-3xl font-medium">Redis Queue Healthy</div>
              <div className="text-emerald-400 mt-3">Fallback mode: OFF</div>
            </div>
          )}

          {activeScreen === 'properties' && <div className="text-center py-40 text-6xl text-zinc-700 font-light">Properties Inventory<br />(/properties table)</div>}

          {activeScreen === 'system-health' && (
            <div className="grid grid-cols-2 gap-6 max-w-3xl">
              <div className="bg-zinc-900 rounded-3xl p-8">/health → <span className="text-emerald-400">200 OK</span></div>
              <div className="bg-zinc-900 rounded-3xl p-8">Webhook verified → <span className="text-emerald-400">OK</span></div>
            </div>
          )}

          {activeScreen === 'settings' && (
            <div className="max-w-md space-y-8">
              <div className="bg-zinc-900 rounded-3xl p-8">
                <div className="font-medium mb-6">Business Profile Defaults</div>
                <input className="w-full rounded-3xl py-4 px-6 bg-zinc-800 mb-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Default price prefix" />
                <button className="w-full py-4 bg-white text-black rounded-3xl hover:bg-zinc-100 transition-colors">Save Settings</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
