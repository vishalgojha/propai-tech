import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertCircle, CheckCircle, Clock, Zap, BarChart3, Users, MessageSquare, Lightbulb, FileText, Settings, LogOut, RefreshCw, ChevronRight, Play, CheckCircle2, AlertTriangle, Pause } from 'lucide-react';
import { toast } from 'sonner';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface SetupConfig {
  baseUrl: string;
  apiKey: string;
  role: 'realtor_admin' | 'ops';
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
}

interface AuditEntry {
  timestamp: number;
  screen: string;
  method: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  client?: string;
  createdAtIso?: string;
  scheduledAtIso?: string;
  template?: {
    name: string;
    language: string;
    category: string;
  };
  compliance?: {
    requireApproval?: boolean;
    approvedBy?: string;
    approvedAtIso?: string;
    consentMode?: string;
    reraProjectId?: string;
  };
  progress?: {
    processed: number;
    sent: number;
    failed: number;
    optedOut: number;
    blockedByPolicy: number;
    lastIndex: number;
  };
  audience?: string[];
  lastPolicyCheck?: {
    ok: boolean;
    reasons: string[];
    warnings: string[];
  };
}

interface Consent {
  phoneE164: string;
  status: 'opted_in' | 'opted_out';
  channel: string;
  source: string;
  purpose: string;
  proofRef?: string;
  consentedAtIso?: string;
  revokedAtIso?: string;
  updatedAtIso: string;
}

interface AgentSession {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  turns: number;
  pendingActions: PendingAction[];
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestampIso: string;
}

interface PendingAction {
  id: string;
  tool: string;
  reason: string;
  requestMessage: string;
  createdAtIso: string;
  risk?: string;
}

interface IntentResult {
  intent: string;
  confidence: number;
  route?: string;
  provider?: string;
  fields?: Record<string, unknown>;
  secondaryIntents?: Array<{ intent: string; confidence: number }>;
}

// ============================================================================
// CONTEXTS
// ============================================================================

const ConfigContext = createContext<{
  config: SetupConfig | null;
  setConfig: (config: SetupConfig) => void;
}>({ config: null, setConfig: () => {} });

const AuditContext = createContext<{
  entries: AuditEntry[];
  addEntry: (entry: Omit<AuditEntry, 'timestamp'>) => void;
  clearLog: () => void;
}>({ entries: [], addEntry: () => {}, clearLog: () => {} });

// ============================================================================
// HOOKS
// ============================================================================

const useConfig = () => useContext(ConfigContext);
const useAudit = () => useContext(AuditContext);

const useApi = () => {
  const { config } = useConfig();
  const { addEntry } = useAudit();

  return useCallback(
    async (method: string, endpoint: string, body?: unknown, screen?: string) => {
      if (!config) throw new Error('Config not set');

      const startTime = performance.now();
      const url = `${config.baseUrl}${endpoint}`;

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'x-agent-api-key': config.apiKey,
            'x-agent-role': config.role,
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        const durationMs = Math.round(performance.now() - startTime);
        const data = await response.json();
        const normalized = data?.result !== undefined ? data.result : data;

        if (screen) {
          addEntry({
            screen,
            method,
            endpoint,
            statusCode: response.status,
            durationMs,
          });
        }

        if (!response.ok) {
          throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
        }

        return normalized;
      } catch (error) {
        const durationMs = Math.round(performance.now() - startTime);
        if (screen) {
          addEntry({
            screen,
            method,
            endpoint,
            statusCode: 0,
            durationMs,
          });
        }
        throw error;
      }
    },
    [config, addEntry]
  );
};

// ============================================================================
// SETUP MODAL
// ============================================================================

const SetupModal: React.FC<{ onComplete: (config: SetupConfig) => void }> = ({ onComplete }) => {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [role, setRole] = useState<'realtor_admin' | 'ops'>('ops');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseUrl || !apiKey) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers: {
          'x-agent-api-key': apiKey,
          'x-agent-role': role,
        },
      });

      if (!response.ok) {
        throw new Error('Health check failed');
      }

      onComplete({ baseUrl, apiKey, role });
    } catch (error) {
      toast.error(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>PropAI Control Plane Setup</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Base URL</label>
            <Input
              type="url"
              placeholder="https://api.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="text-sm font-medium">API Key</label>
            <Input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realtor_admin">Realtor Admin</SelectItem>
                <SelectItem value="ops">Ops</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// SCREENS
// ============================================================================

// Screen 1: Dashboard
const Dashboard: React.FC = () => {
  const api = useApi();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [health, queue, campaigns, consents] = await Promise.all([
          api('GET', '/connectors/health', undefined, 'Dashboard'),
          api('GET', '/ops/queue/status', undefined, 'Dashboard'),
          api('GET', '/realtor/campaign/list', undefined, 'Dashboard'),
          api('GET', '/realtor/consent/list', undefined, 'Dashboard'),
        ]);

        setStats({
          totalCampaigns: campaigns?.campaigns?.length || 0,
          totalConsents: consents?.records?.length || 0,
          queueReady: queue?.ready ? 'Ready' : 'Not Ready',
          connectorCount: health?.connectors?.length || 0,
          connectors: health?.connectors || [],
          campaigns: campaigns?.campaigns || [],
          queue: queue || {},
        });
      } catch (error) {
        toast.error(`Failed to load dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [api]);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Campaigns</div>
          <div className="text-2xl font-bold mt-2">{stats?.totalCampaigns}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Consents</div>
          <div className="text-2xl font-bold mt-2">{stats?.totalConsents}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Queue</div>
          <div className="text-2xl font-bold mt-2">{stats?.queueReady}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Connectors</div>
          <div className="text-2xl font-bold mt-2">{stats?.connectorCount}</div>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-4">Connector Health</h2>
        <div className="grid grid-cols-3 gap-4">
          {stats?.connectors?.map((c: any) => (
            <div key={c.connector?.id || c.id} className="flex items-center justify-between p-3 bg-secondary rounded">
              <span className="text-sm">{c.connector?.name || c.name || c.connector?.id}</span>
              <Badge variant={c.status === 'healthy' ? 'default' : 'destructive'}>{c.status}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-4">Recent Campaigns</h2>
        <div className="space-y-2">
          {stats?.campaigns?.slice(0, 5).map((c: Campaign) => (
            <div key={c.id} className="flex items-center justify-between p-2 border-b border-border">
              <div>
                <div className="font-medium text-sm">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.createdAtIso ? new Date(c.createdAtIso).toLocaleDateString() : '-'}</div>
              </div>
              <Badge variant="outline">{c.status}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

// Screen 2: Consent Ledger
const ConsentLedger: React.FC = () => {
  const api = useApi();
  const { config } = useConfig();
  const [tab, setTab] = useState('list');
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [result, setResult] = useState<any>(null);

  const loadConsents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api('GET', '/realtor/consent/list', undefined, 'Consent Ledger');
      setConsents(data?.records || []);
    } catch (error) {
      toast.error(`Failed to load consents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (tab === 'list') loadConsents();
  }, [tab, loadConsents]);

  const handleAddConsent = async () => {
    if (!formData.phone) {
      toast.error('Phone is required');
      return;
    }
    try {
      setLoading(true);
      const res = await api(
        'POST',
        '/realtor/consent/add',
        {
          phone: formData.phone,
          channel: formData.channel || 'whatsapp',
          source: formData.source || 'manual',
          purpose: formData.purpose || 'marketing',
          proofRef: formData.proofRef || undefined,
        },
        'Consent Ledger'
      );
      setResult(res);
      setFormData({});
      toast.success('Consent added successfully');
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeConsent = async () => {
    if (!formData.phone) {
      toast.error('Phone is required');
      return;
    }
    try {
      setLoading(true);
      const res = await api(
        'POST',
        '/realtor/consent/revoke',
        {
          phone: formData.phone,
          source: formData.source || 'manual',
          reason: formData.reason || 'user-request',
        },
        'Consent Ledger'
      );
      setResult(res);
      setFormData({});
      toast.success('Consent revoked successfully');
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckConsent = async () => {
    if (!formData.phone) {
      toast.error('Phone is required');
      return;
    }
    try {
      setLoading(true);
      const res = await api('GET', `/realtor/consent/status?phone=${encodeURIComponent(formData.phone)}`, undefined, 'Consent Ledger');
      setResult(res);
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const canMutate = Boolean(config);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Consent Ledger</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="add">Add</TabsTrigger>
          <TabsTrigger value="revoke">Revoke</TabsTrigger>
          <TabsTrigger value="check">Check</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>

        {canMutate && (
          <>
            <TabsContent value="add" className="space-y-4">
              <Card className="p-4">
                <div className="space-y-4">
                  <Input
                    placeholder="Phone (E.164, e.g. +919999999999)"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                  <Input
                    placeholder="Channel"
                    value={formData.channel || ''}
                    onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                  />
                  <Input
                    placeholder="Source (optional)"
                    value={formData.source || ''}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  />
                  <Input
                    placeholder="Purpose (optional)"
                    value={formData.purpose || ''}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                  />
                  <Input
                    placeholder="Proof Ref (optional)"
                    value={formData.proofRef || ''}
                    onChange={(e) => setFormData({ ...formData, proofRef: e.target.value })}
                  />
                  <Button onClick={handleAddConsent} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Consent
                  </Button>
                  {result && <pre className="bg-secondary p-3 rounded text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="revoke" className="space-y-4">
              <Card className="p-4">
                <div className="space-y-4">
                  <Input
                    placeholder="Phone (E.164)"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                  <Input
                    placeholder="Source (optional)"
                    value={formData.source || ''}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  />
                  <Input
                    placeholder="Reason (optional)"
                    value={formData.reason || ''}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  />
                  <Button onClick={handleRevokeConsent} disabled={loading} variant="destructive">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Revoke Consent
                  </Button>
                  {result && <pre className="bg-secondary p-3 rounded text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>}
                </div>
              </Card>
            </TabsContent>
          </>
        )}

        <TabsContent value="check" className="space-y-4">
          <Card className="p-4">
            <div className="space-y-4">
              <Input
                placeholder="Phone (E.164)"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
              <Button onClick={handleCheckConsent} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Check Status
              </Button>
              {result && <pre className="bg-secondary p-3 rounded text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Card className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-2">Phone</th>
                      <th className="text-left p-2">Channel</th>
                      <th className="text-left p-2">Source</th>
                      <th className="text-left p-2">Purpose</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consents.map((c) => (
                      <tr key={c.phoneE164} className="border-b border-border hover:bg-secondary">
                        <td className="p-2">{c.phoneE164}</td>
                        <td className="p-2">{c.channel}</td>
                        <td className="p-2">{c.source}</td>
                        <td className="p-2">{c.purpose}</td>
                        <td className="p-2"><Badge variant="outline">{c.status}</Badge></td>
                        <td className="p-2 text-xs text-muted-foreground">{new Date(c.updatedAtIso).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Screen 3: Campaign Studio
const CampaignStudio: React.FC = () => {
  const api = useApi();
  const { config } = useConfig();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<any>({});
  const [audience, setAudience] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCreateCampaign = async () => {
    if (!formData.name || !formData.templateName) {
      toast.error('Please fill in all required fields');
      return;
    }
    setStep(2);
  };

  const handleReview = async () => {
    if (audience.length === 0) {
      toast.error('Please add at least one realtor ID');
      return;
    }
    setStep(3);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const payload = {
        name: formData.name,
        templateName: formData.templateName,
        client: formData.client || 'default',
        language: formData.language || 'en',
        category: formData.category || 'marketing',
        consentMode: formData.consentMode || 'required',
        requireApproval: formData.requireApproval !== false,
        reraProjectId: formData.reraProjectId || undefined,
        audience,
      };
      const res = await api('POST', '/realtor/campaign/create', payload, 'Campaign Studio');
      setResult(res);
      toast.success('Campaign created successfully');
      setTimeout(() => {
        setStep(1);
        setFormData({});
        setAudience([]);
        setResult(null);
      }, 2000);
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const canMutate = Boolean(config);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Campaign Studio</h1>

      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`flex items-center justify-center w-10 h-10 rounded border-2 ${step >= s ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
            {s}
          </div>
        ))}
      </div>

      {step === 1 && canMutate && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Step 1: Draft Campaign</h2>
          <Input
            placeholder="Campaign Name"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Input
            placeholder="Template Name"
            value={formData.templateName || ''}
            onChange={(e) => setFormData({ ...formData, templateName: e.target.value })}
          />
          <Input
            placeholder="Client (optional)"
            value={formData.client || ''}
            onChange={(e) => setFormData({ ...formData, client: e.target.value })}
          />
          <Input
            placeholder="Language (default: en)"
            value={formData.language || ''}
            onChange={(e) => setFormData({ ...formData, language: e.target.value })}
          />
          <Select value={formData.category || 'marketing'} onValueChange={(v) => setFormData({ ...formData, category: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="marketing">Marketing</SelectItem>
              <SelectItem value="utility">Utility</SelectItem>
            </SelectContent>
          </Select>
          <Select value={formData.consentMode || 'required'} onValueChange={(v) => setFormData({ ...formData, consentMode: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Consent Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="required">Required</SelectItem>
              <SelectItem value="optional">Optional</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={String(formData.requireApproval !== false)}
            onValueChange={(v) => setFormData({ ...formData, requireApproval: v === 'true' })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Approval Required" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Approval Required</SelectItem>
              <SelectItem value="false">No Approval</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="RERA Project ID (recommended for marketing)"
            value={formData.reraProjectId || ''}
            onChange={(e) => setFormData({ ...formData, reraProjectId: e.target.value })}
          />
          <Button onClick={handleCreateCampaign} className="w-full">Next Step</Button>
        </Card>
      )}

      {step === 2 && canMutate && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Step 2: Audience Prep</h2>
          <Textarea
            placeholder='Paste JSON array of phone numbers: ["+919999999999", "+918888888888"]'
            value={JSON.stringify(audience)}
            onChange={(e) => {
              try {
                setAudience(JSON.parse(e.target.value));
              } catch {}
            }}
            className="font-mono text-xs"
          />
          <div className="text-sm text-muted-foreground">Audience size: {audience.length} recipients</div>
          <div className="flex gap-2">
            <Button onClick={() => setStep(1)} variant="outline">Back</Button>
            <Button onClick={handleReview} className="flex-1">Review</Button>
          </div>
        </Card>
      )}

      {step === 3 && canMutate && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Step 3: Review</h2>
          <pre className="bg-secondary p-4 rounded text-xs overflow-auto">{JSON.stringify({ ...formData, audience }, null, 2)}</pre>
          <div className="flex gap-2">
            <Button onClick={() => setStep(2)} variant="outline">Back</Button>
            <Button onClick={handleSubmit} disabled={loading} className="flex-1">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Campaign
            </Button>
          </div>
          {result && <pre className="bg-secondary p-3 rounded text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>}
        </Card>
      )}

      {!canMutate && (
        <Card className="p-6">
          <p className="text-muted-foreground">Current role cannot create campaigns</p>
        </Card>
      )}
    </div>
  );
};

// Screen 4: Campaign Ops
const CampaignOps: React.FC = () => {
  const api = useApi();
  const { config } = useConfig();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [preflight, setPreflight] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    const loadCampaigns = async () => {
      try {
        const data = await api('GET', '/realtor/campaign/list', undefined, 'Campaign Ops');
        setCampaigns(data?.campaigns || []);
      } catch (error) {
        toast.error(`Failed to load campaigns: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    loadCampaigns();
  }, [api]);

  const loadStatus = useCallback(async (campaignId: string) => {
    try {
      const data = await api('GET', `/realtor/campaign/status?id=${campaignId}`, undefined, 'Campaign Ops');
      setStatus(data?.campaign || null);
    } catch (error) {
      toast.error(`Failed to load status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [api]);

  useEffect(() => {
    if (selectedCampaign) {
      loadStatus(selectedCampaign.id);
    }
  }, [selectedCampaign, loadStatus]);

  const handlePreflight = async () => {
    if (!selectedCampaign) return;
    try {
      setLoading(true);
      const res = await api('POST', '/realtor/campaign/preflight', { id: selectedCampaign.id }, 'Campaign Ops');
      setPreflight(res?.preflight || null);
      setStatus(res?.campaign || status);
    } catch (error) {
      toast.error(`Preflight failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedCampaign) return;
    try {
      setLoading(true);
      await api(
        'POST',
        '/realtor/campaign/approve',
        { id: selectedCampaign.id, approvedBy: config?.role || 'realtor_admin' },
        'Campaign Ops'
      );
      toast.success('Campaign approved');
      loadStatus(selectedCampaign.id);
    } catch (error) {
      toast.error(`Approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    if (!selectedCampaign) return;
    try {
      setLoading(true);
      setPolling(true);
      await api('POST', '/realtor/campaign/run', { id: selectedCampaign.id }, 'Campaign Ops');
      toast.success('Campaign started');
      loadStatus(selectedCampaign.id);
    } catch (error) {
      toast.error(`Run failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setPolling(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!polling || !selectedCampaign) return;
    const interval = setInterval(() => {
      loadStatus(selectedCampaign.id);
    }, 5000);
    return () => clearInterval(interval);
  }, [polling, selectedCampaign, loadStatus]);

  const canMutate = Boolean(config);

  return (
    <div className="grid grid-cols-3 gap-6 h-96">
      <div className="col-span-1 border-r border-border">
        <h2 className="font-semibold mb-4">Campaigns</h2>
        <ScrollArea className="h-full">
          <div className="space-y-2">
            {campaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCampaign(c)}
                className={`w-full text-left p-3 rounded border-2 transition-colors ${selectedCampaign?.id === c.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary'}`}
              >
                <div className="font-medium text-sm">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.status}</div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="col-span-2 space-y-4">
        {selectedCampaign ? (
          <>
            <Card className="p-4">
              <h3 className="font-semibold mb-2">{selectedCampaign.name}</h3>
              <div className="space-y-2 text-sm">
                <div>Status: <Badge variant="outline">{status?.status || selectedCampaign.status}</Badge></div>
                <div>Created: {selectedCampaign.createdAtIso ? new Date(selectedCampaign.createdAtIso).toLocaleString() : '-'}</div>
              </div>
            </Card>

            {canMutate && (
              <div className="flex gap-2">
                <Button onClick={handlePreflight} disabled={loading} variant="outline">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Preflight
                </Button>
                {preflight?.ok && (
                  <Button onClick={handleApprove} disabled={loading}>
                    Approve
                  </Button>
                )}
                {status?.compliance?.approvedAtIso && (
                  <Button onClick={handleRun} disabled={loading} className="bg-green-600 hover:bg-green-700">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Run
                  </Button>
                )}
              </div>
            )}

            {preflight && (
              <Card className="p-4">
                <h3 className="font-semibold mb-2">Preflight Results</h3>
                <pre className="bg-secondary p-3 rounded text-xs overflow-auto">{JSON.stringify(preflight, null, 2)}</pre>
              </Card>
            )}

            {polling && status?.progress && (
              <Card className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>
                      {Math.round(((status.progress.processed || 0) / Math.max(1, status.audience?.length || 0)) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${((status.progress.processed || 0) / Math.max(1, status.audience?.length || 0)) * 100}%` }}
                    />
                  </div>
                </div>
              </Card>
            )}
          </>
        ) : (
          <Card className="p-6 text-center text-muted-foreground">
            Select a campaign to view details
          </Card>
        )}
      </div>
    </div>
  );
};

// Screen 5: Agent Sessions
const AgentSessions: React.FC = () => {
  const api = useApi();
  const { config } = useConfig();
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [contextJson, setContextJson] = useState('{"sessionId": ""}');
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const data = await api('GET', '/agent/sessions', undefined, 'Agent Sessions');
        setSessions(data?.sessions || []);
      } catch (error) {
        toast.error(`Failed to load sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    loadSessions();
  }, [api]);

  const syncSelectedSession = useCallback(
    async (sessionId: string) => {
      const data = await api('GET', `/agent/session/${sessionId}`, undefined, 'Agent Sessions');
      const session = data?.session;
      if (!session) return;
      setMessages(session.transcript || []);
      setActions(session.pendingActions || []);
      setSelectedSession(session);
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== session.id);
        return [session, ...filtered];
      });
    },
    [api]
  );

  const handleStartSession = async () => {
    try {
      setLoading(true);
      let sessionId: string | undefined;
      if (contextJson.trim()) {
        const parsed = JSON.parse(contextJson);
        if (typeof parsed?.sessionId === 'string' && parsed.sessionId.trim()) {
          sessionId = parsed.sessionId.trim();
        }
      }
      const res = await api('POST', '/agent/session/start', { sessionId }, 'Agent Sessions');
      const session = res?.session || res;
      if (session) {
        setSessions((prev) => {
          const filtered = prev.filter((s) => s.id !== session.id);
          return [session, ...filtered];
        });
        setSelectedSession(session);
        setMessages(session.transcript || []);
        setActions(session.pendingActions || []);
      }
      setContextJson('{"sessionId": ""}');
      toast.success('Session started');
    } catch (error) {
      toast.error(`Failed to start session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedSession || !newMessage.trim()) return;
    try {
      setLoading(true);
      const res = await api(
        'POST',
        `/agent/session/${selectedSession.id}/message`,
        { message: newMessage },
        'Agent Sessions'
      );
      if (res?.session) {
        setMessages(res.session.transcript || []);
        setActions(res.session.pendingActions || []);
      }
      setNewMessage('');
      toast.success('Message sent');
      setPolling(true);
    } catch (error) {
      toast.error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAction = async (actionId: string) => {
    if (!selectedSession) return;
    try {
      setLoading(true);
      await api('POST', `/agent/session/${selectedSession.id}/approve`, { actionId }, 'Agent Sessions');
      toast.success('Action approved');
      await syncSelectedSession(selectedSession.id);
      setPolling(true);
    } catch (error) {
      toast.error(`Failed to approve: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectAction = async (actionId: string) => {
    if (!selectedSession) return;
    try {
      setLoading(true);
      await api('POST', `/agent/session/${selectedSession.id}/reject`, { actionId }, 'Agent Sessions');
      toast.success('Action rejected');
      await syncSelectedSession(selectedSession.id);
      setPolling(true);
    } catch (error) {
      toast.error(`Failed to reject: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedSession) return;
    void syncSelectedSession(selectedSession.id);
  }, [selectedSession?.id, syncSelectedSession]);

  useEffect(() => {
    if (!polling || !selectedSession) return;
    const interval = setInterval(() => {
      void syncSelectedSession(selectedSession.id);
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, selectedSession, syncSelectedSession]);

  const canMutate = Boolean(config);

  return (
    <div className="grid grid-cols-3 gap-6 h-96">
      <div className="col-span-1 border-r border-border">
        <h2 className="font-semibold mb-4">Sessions</h2>
        {canMutate && (
          <div className="space-y-2 mb-4">
            <Textarea
              placeholder='Optional start payload: {"sessionId":"session_123"}'
              value={contextJson}
              onChange={(e) => setContextJson(e.target.value)}
              className="text-xs font-mono"
              rows={3}
            />
            <Button onClick={handleStartSession} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              New Session
            </Button>
          </div>
        )}
        <ScrollArea className="h-full">
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSession(s)}
                className={`w-full text-left p-3 rounded border-2 transition-colors ${selectedSession?.id === s.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary'}`}
              >
                <div className="font-medium text-sm truncate">{s.id}</div>
                <div className="text-xs text-muted-foreground">
                  Turns: {s.turns} | {new Date(s.updatedAtIso).toLocaleTimeString()}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="col-span-2 flex flex-col">
        {selectedSession ? (
          <>
            <ScrollArea className="flex-1 border-b border-border mb-4">
              <div className="space-y-3 p-4">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      m.role === 'user' ? 'justify-end' : m.role === 'assistant' ? 'justify-start' : 'justify-center'
                    }`}
                  >
                    <div
                      className={`max-w-xs p-3 rounded ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : m.role === 'assistant'
                            ? 'bg-secondary'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="text-sm">{m.content}</div>
                      <div className="text-xs opacity-70 mt-1">{new Date(m.timestampIso).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {actions.length > 0 && (
              <Card className="p-3 mb-4 bg-secondary">
                <h3 className="font-semibold text-sm mb-2">Pending Actions</h3>
                <div className="space-y-2">
                  {actions.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-2 bg-background rounded">
                      <div>
                        <div className="text-sm">{a.tool}</div>
                        <div className="text-xs text-muted-foreground">{a.reason}</div>
                      </div>
                      {canMutate && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApproveAction(a.id)} disabled={loading}>Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => handleRejectAction(a.id)} disabled={loading}>Reject</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={!canMutate}
              />
              {canMutate && (
                <Button onClick={handleSendMessage} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send
                </Button>
              )}
            </div>
          </>
        ) : (
          <Card className="p-6 text-center text-muted-foreground">
            Select a session to view details
          </Card>
        )}
      </div>
    </div>
  );
};

// Screen 6: Guided Flow
const GuidedFlow: React.FC = () => {
  const api = useApi();
  const [flowId, setFlowId] = useState('publish_listing');
  const [contextJson, setContextJson] = useState('{"sessionId": ""}');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<any>(null);
  const [answers, setAnswers] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const currentStep = state?.steps?.find((s: any) => s.isCurrent) || null;

  const handleStart = async () => {
    if (!flowId) {
      toast.error('Please enter a flow ID');
      return;
    }
    try {
      setLoading(true);
      let startSessionId = '';
      if (contextJson.trim()) {
        const parsed = JSON.parse(contextJson);
        if (typeof parsed?.sessionId === 'string' && parsed.sessionId.trim()) {
          startSessionId = parsed.sessionId.trim();
        }
      }
      if (!startSessionId) {
        const sessionStart = await api('POST', '/agent/session/start', {}, 'Guided Flow');
        startSessionId = sessionStart?.session?.id;
      }
      const res = await api('POST', '/guided/start', { sessionId: startSessionId, flowId }, 'Guided Flow');
      setSessionId(startSessionId);
      setState(res?.guidedFlow || null);
      toast.success('Flow started');
    } catch (error) {
      toast.error(`Failed to start flow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    const loadState = async () => {
      try {
        const res = await api('GET', `/guided/state?sessionId=${sessionId}`, undefined, 'Guided Flow');
        setState(res?.guidedFlow || null);
      } catch (error) {
        toast.error(`Failed to load state: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    loadState();
  }, [sessionId, api]);

  const handleAnswer = async () => {
    if (!sessionId || !currentStep) return;
    try {
      setLoading(true);
      const rawAnswer = answers[currentStep.id];
      const answer = currentStep.kind === 'number' ? Number(rawAnswer) : rawAnswer;
      const res = await api(
        'POST',
        '/guided/answer',
        { sessionId, stepId: currentStep.id, answer },
        'Guided Flow'
      );
      setState(res?.guidedFlow || null);
      setAnswers({});
      toast.success('Answer submitted');
    } catch (error) {
      toast.error(`Failed to submit answer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Guided Flow</h1>

      <div className="grid grid-cols-3 gap-6">
        <Card className="p-4">
          <h2 className="font-semibold mb-4">Start</h2>
          <div className="space-y-3">
            <Input
              placeholder="Flow ID"
              value={flowId}
              onChange={(e) => setFlowId(e.target.value)}
            />
            <Textarea
              placeholder='Optional existing session: {"sessionId":"session_123"}'
              value={contextJson}
              onChange={(e) => setContextJson(e.target.value)}
              className="text-xs font-mono"
              rows={4}
            />
            <Button onClick={handleStart} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Flow
            </Button>
          </div>
        </Card>

        {state && (
          <>
            <Card className="p-4">
              <h2 className="font-semibold mb-4">State</h2>
              <div className="space-y-2 text-sm">
                <div>Flow: {state.flowLabel}</div>
                <div>Status: {state.status}</div>
                <div>Current Step: {state.currentStepId || 'completed'}</div>
                <div>Progress: {Math.round(state.progressPercent || 0)}%</div>
                <pre className="bg-secondary p-2 rounded text-xs overflow-auto">{JSON.stringify(state.answers, null, 2)}</pre>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold mb-4">Answer</h2>
              <div className="space-y-3">
                {currentStep ? (
                  <>
                    <div className="text-sm font-medium">{currentStep.label}</div>
                    <div className="text-xs text-muted-foreground">{currentStep.prompt}</div>
                    {(currentStep.kind === 'text' || currentStep.kind === 'number') && (
                      <Input
                        placeholder={currentStep.placeholder || currentStep.label}
                        type={currentStep.kind === 'number' ? 'number' : 'text'}
                        value={answers[currentStep.id] || ''}
                        onChange={(e) => setAnswers({ ...answers, [currentStep.id]: e.target.value })}
                      />
                    )}
                    {currentStep.kind === 'single_select' && (
                      <Select
                        value={answers[currentStep.id] || ''}
                        onValueChange={(v) => setAnswers({ ...answers, [currentStep.id]: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          {(currentStep.options || []).map((o: any) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button onClick={handleAnswer} disabled={loading} className="w-full">
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Submit
                    </Button>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No pending step. Guided flow may be complete.</div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

// Screen 7: Queue + Group Posting
const QueueGroupPosting: React.FC = () => {
  const api = useApi();
  const { config } = useConfig();
  const [tab, setTab] = useState('queue');
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [groupStatus, setGroupStatus] = useState<any>(null);
  const [groupQueue, setGroupQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [formData, setFormData] = useState<any>({});

  const loadQueueStatus = useCallback(async () => {
    try {
      const data = await api('GET', '/ops/queue/status', undefined, 'Queue + Group Posting');
      setQueueStatus(data);
    } catch (error) {
      toast.error(`Failed to load queue status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [api]);

  const loadGroupStatus = useCallback(async () => {
    try {
      const data = await api('GET', '/group-posting/status', undefined, 'Queue + Group Posting');
      setGroupStatus(data);
    } catch (error) {
      toast.error(`Failed to load group status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [api]);

  const loadGroupQueue = useCallback(async () => {
    try {
      const data = await api('GET', '/group-posting/queue', undefined, 'Queue + Group Posting');
      setGroupQueue(data?.items || []);
    } catch (error) {
      toast.error(`Failed to load group queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [api]);

  useEffect(() => {
    if (tab === 'queue') loadQueueStatus();
    if (tab === 'group') {
      loadGroupStatus();
      loadGroupQueue();
    }
  }, [tab, loadQueueStatus, loadGroupStatus, loadGroupQueue]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (tab === 'queue') loadQueueStatus();
      if (tab === 'group') {
        loadGroupStatus();
        loadGroupQueue();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, tab, loadQueueStatus, loadGroupStatus, loadGroupQueue]);

  const handleIntake = async () => {
    if (!formData.content) {
      toast.error('Content is required');
      return;
    }
    try {
      setLoading(true);
      const targets = formData.targets ? JSON.parse(formData.targets) : undefined;
      await api(
        'POST',
        '/group-posting/intake',
        {
          content: formData.content,
          targets,
          kind: formData.kind || undefined,
          priority: formData.priority || undefined,
          scheduleMode: formData.scheduleMode || undefined,
          source: 'api',
        },
        'Queue + Group Posting'
      );
      toast.success('Intake submitted');
      setFormData({});
      loadGroupQueue();
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDispatch = async () => {
    try {
      setLoading(true);
      await api('POST', '/group-posting/dispatch', { limit: 10, dryRun: false }, 'Queue + Group Posting');
      toast.success('Dispatched');
      loadGroupQueue();
      loadGroupStatus();
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRequeue = async (id: string) => {
    try {
      setLoading(true);
      await api('POST', `/group-posting/${id}/requeue`, {}, 'Queue + Group Posting');
      toast.success('Requeued');
      loadGroupQueue();
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const canMutate = Boolean(config);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Queue + Group Posting</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="queue">Ops Queue</TabsTrigger>
          <TabsTrigger value="group">Group Posting</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? <Pause className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {autoRefresh ? 'Auto-refreshing' : 'Auto-refresh'}
            </Button>
          </div>

          {queueStatus && (
            <Card className="p-4 grid grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Enabled</div>
                <div className="text-2xl font-bold">{queueStatus.enabled ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Ready</div>
                <div className="text-2xl font-bold">{queueStatus.ready ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Queue Name</div>
                <div className="text-sm font-semibold">{queueStatus.queueName}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Redis Configured</div>
                <div className="text-2xl font-bold">{queueStatus.redisConfigured ? 'Yes' : 'No'}</div>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="group" className="space-y-4">
          {groupStatus && (
            <Card className="p-4">
              <h2 className="font-semibold mb-2">Status</h2>
              <pre className="bg-secondary p-3 rounded text-xs overflow-auto">{JSON.stringify(groupStatus, null, 2)}</pre>
            </Card>
          )}

          {canMutate && (
            <Card className="p-4">
              <h2 className="font-semibold mb-4">Intake</h2>
              <div className="space-y-4">
                <Textarea
                  placeholder="Content"
                  value={formData.content || ''}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                />
                <Textarea
                  placeholder='Targets (JSON array, optional): ["group-id-1", "group-id-2"]'
                  value={formData.targets || ''}
                  onChange={(e) => setFormData({ ...formData, targets: e.target.value })}
                  className="text-xs font-mono"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Kind (listing/requirement)"
                    value={formData.kind || ''}
                    onChange={(e) => setFormData({ ...formData, kind: e.target.value })}
                  />
                  <Input
                    placeholder="Priority (normal/high)"
                    value={formData.priority || ''}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  />
                  <Input
                    placeholder="Schedule (once/daily/weekly)"
                    value={formData.scheduleMode || ''}
                    onChange={(e) => setFormData({ ...formData, scheduleMode: e.target.value })}
                  />
                </div>
                <Button onClick={handleIntake} disabled={loading} className="w-full">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Intake
                </Button>
                <Button onClick={handleDispatch} disabled={loading} variant="outline" className="w-full">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Run Manual Dispatch
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h2 className="font-semibold mb-4">Queue</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">Kind</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Next Post</th>
                    {canMutate && <th className="text-left p-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {groupQueue.map((item) => (
                    <tr key={item.id} className="border-b border-border hover:bg-secondary">
                      <td className="p-2">{item.id}</td>
                      <td className="p-2">{item.kind}</td>
                      <td className="p-2"><Badge variant="outline">{item.status}</Badge></td>
                      <td className="p-2 text-xs">{new Date(item.nextPostAtIso).toLocaleString()}</td>
                      {canMutate && (
                        <td className="p-2">
                          <div className="flex gap-2">
                            {item.status === 'failed' && (
                              <Button size="sm" variant="outline" onClick={() => handleRequeue(item.id)} disabled={loading}>Requeue</Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Screen 8: Intent Lab
const IntentLab: React.FC = () => {
  const api = useApi();
  const [message, setMessage] = useState('');
  const [contextJson, setContextJson] = useState('{"useAi": false, "model": ""}');
  const [result, setResult] = useState<IntentResult | null>(null);
  const [history, setHistory] = useState<IntentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const handleClassify = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    try {
      setLoading(true);
      const options = contextJson ? JSON.parse(contextJson) : {};
      const res = await api('POST', '/realtor/intent/classify', {
        text: message,
        useAi: Boolean(options.useAi),
        model: options.model || undefined,
      }, 'Intent Lab');

      setResult(res);
      setHistory([res, ...history.slice(0, 9)]);
    } catch (error) {
      toast.error(`Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Intent Lab</h1>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold mb-4">Classify Message</h2>
            <div className="space-y-4">
              <Textarea
                placeholder="Enter message to classify..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
              />
              <Textarea
                placeholder='Options JSON (optional): {"useAi": true, "model": "gpt-4o-mini"}'
                value={contextJson}
                onChange={(e) => setContextJson(e.target.value)}
                className="text-xs font-mono"
                rows={3}
              />
              <Button onClick={handleClassify} disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Classify
              </Button>
            </div>
          </Card>

          {result && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Result</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRaw(!showRaw)}
                >
                  {showRaw ? 'Summary' : 'Raw JSON'}
                </Button>
              </div>

              {showRaw ? (
                <pre className="bg-secondary p-3 rounded text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Top Intent</div>
                    <Badge className="text-lg py-1 px-3">{result.intent}</Badge>
                  </div>
                  {result.route && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">Route</div>
                      <div className="text-sm">{result.route}</div>
                    </div>
                  )}
                  {result.provider && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">Provider</div>
                      <div className="text-sm">{result.provider}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Confidence</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${result.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{Math.round(result.confidence * 100)}%</span>
                    </div>
                  </div>
                  {(result.secondaryIntents ?? []).length > 0 && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">Secondary Intents</div>
                      <div className="space-y-1">
                        {(result.secondaryIntents ?? []).map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span>{s.intent}</span>
                            <span className="text-muted-foreground">{Math.round(s.confidence * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.fields && Object.keys(result.fields).length > 0 && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">Extracted Fields</div>
                      <pre className="bg-secondary p-2 rounded text-xs overflow-auto">{JSON.stringify(result.fields, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        <div>
          <Card className="p-4">
            <h2 className="font-semibold mb-4">History</h2>
            <ScrollArea className="h-96">
              <div className="space-y-2">
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setResult(h)}
                    className="w-full text-left p-2 rounded hover:bg-secondary border border-border"
                  >
                    <div className="font-medium text-sm truncate">{h.intent}</div>
                    <div className="text-xs text-muted-foreground">{Math.round(h.confidence * 100)}%</div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Screen 9: Audit Trail
const AuditTrail: React.FC = () => {
  const { entries, clearLog } = useAudit();
  const [filterScreen, setFilterScreen] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  const filtered = entries.filter((e) => {
    if (filterScreen && e.screen !== filterScreen) return false;
    if (filterStatus && e.statusCode !== parseInt(filterStatus)) return false;
    return true;
  });

  const paged = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  const screens = Array.from(new Set(entries.map((e) => e.screen)));
  const statuses = Array.from(new Set(entries.map((e) => e.statusCode)));

  const handleExport = () => {
    const json = JSON.stringify(entries, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${Date.now()}.json`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Audit Trail</h1>

      <div className="flex gap-4 items-end">
        <div>
          <label className="text-sm font-medium">Filter by Screen</label>
          <Select value={filterScreen} onValueChange={setFilterScreen}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All screens" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All screens</SelectItem>
              {screens.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Filter by Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s.toString()}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleExport} variant="outline">Export JSON</Button>
        <Button onClick={clearLog} variant="destructive">Clear Log</Button>
      </div>

      <Card className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2">Timestamp</th>
                <th className="text-left p-2">Screen</th>
                <th className="text-left p-2">Method</th>
                <th className="text-left p-2">Endpoint</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Duration (ms)</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((e, i) => (
                <tr key={i} className="border-b border-border hover:bg-secondary">
                  <td className="p-2 text-xs">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="p-2">{e.screen}</td>
                  <td className="p-2"><Badge variant="outline">{e.method}</Badge></td>
                  <td className="p-2 font-mono text-xs">{e.endpoint}</td>
                  <td className="p-2">
                    <Badge variant={e.statusCode >= 200 && e.statusCode < 300 ? 'default' : 'destructive'}>
                      {e.statusCode}
                    </Badge>
                  </td>
                  <td className="p-2">{e.durationMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted-foreground">Showing {paged.length} of {filtered.length} entries</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="px-3 py-1 text-muted-foreground">Page {page} of {totalPages}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

// ============================================================================
// TOP BAR
// ============================================================================

const TopBar: React.FC<{ config: SetupConfig; health: HealthStatus | null; onReconfigure: () => void }> = ({ config, health, onReconfigure }) => {
  const isHealthy = health?.status === 'healthy';

  return (
    <div className="border-b border-border bg-card">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">PropAI Control Plane</h1>
          <Badge variant={isHealthy ? 'default' : 'destructive'} className="gap-2">
            <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
            {health?.status || 'unknown'}
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline">{config.role}</Badge>
          <Button size="sm" variant="outline" onClick={onReconfigure}>
            <Settings className="h-4 w-4 mr-2" />
            Reconfigure
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SIDEBAR
// ============================================================================

const Sidebar: React.FC<{ currentScreen: string; onScreenChange: (screen: string) => void }> = ({ currentScreen, onScreenChange }) => {
  const screens = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'consent', label: 'Consent Ledger', icon: FileText },
    { id: 'campaign-studio', label: 'Campaign Studio', icon: Zap },
    { id: 'campaign-ops', label: 'Campaign Ops', icon: Play },
    { id: 'agent-sessions', label: 'Agent Sessions', icon: MessageSquare },
    { id: 'guided-flow', label: 'Guided Flow', icon: Lightbulb },
    { id: 'queue', label: 'Queue + Group Posting', icon: Users },
    { id: 'intent-lab', label: 'Intent Lab', icon: Lightbulb },
    { id: 'audit', label: 'Audit Trail', icon: FileText },
  ];

  return (
    <div className="w-64 border-r border-border bg-sidebar">
      <div className="p-4 space-y-2">
        {screens.map((screen) => {
          const Icon = screen.icon;
          const isActive = currentScreen === screen.id;
          return (
            <button
              key={screen.id}
              onClick={() => onScreenChange(screen.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded transition-colors ${
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'hover:bg-sidebar-accent text-sidebar-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-sm font-medium">{screen.label}</span>
              {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN APP
// ============================================================================

export default function Home() {
  const [config, setConfig] = useState<SetupConfig | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [currentScreen, setCurrentScreen] = useState('dashboard');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [showSetup, setShowSetup] = useState(!config);

  const addAuditEntry = useCallback((entry: Omit<AuditEntry, 'timestamp'>) => {
    setAuditEntries((prev) => [{ ...entry, timestamp: Date.now() }, ...prev]);
  }, []);

  const clearAuditLog = useCallback(() => {
    setAuditEntries([]);
  }, []);

  useEffect(() => {
    if (!config) return;

    const checkHealth = async () => {
      try {
        const response = await fetch(`${config.baseUrl}/health`, {
          headers: {
            'x-agent-api-key': config.apiKey,
            'x-agent-role': config.role,
          },
        });
        await response.json();
        setHealth({
          status: response.ok ? 'healthy' : 'degraded',
          timestamp: Date.now(),
        });
      } catch (error) {
        setHealth({
          status: 'unhealthy',
          timestamp: Date.now(),
        });
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [config]);

  const handleSetConfig = (newConfig: SetupConfig) => {
    setConfig(newConfig);
    setShowSetup(false);
  };

  const handleReconfigure = () => {
    setShowSetup(true);
  };

  if (showSetup) {
    return <SetupModal onComplete={handleSetConfig} />;
  }

  if (!config) {
    return <div>Loading...</div>;
  }

  return (
    <ConfigContext.Provider value={{ config, setConfig: handleSetConfig }}>
      <AuditContext.Provider value={{ entries: auditEntries, addEntry: addAuditEntry, clearLog: clearAuditLog }}>
        <div className="flex flex-col h-screen bg-background text-foreground">
          <TopBar config={config} health={health} onReconfigure={handleReconfigure} />

          <div className="flex flex-1 overflow-hidden">
            <Sidebar currentScreen={currentScreen} onScreenChange={setCurrentScreen} />

            <div className="flex-1 overflow-auto">
              <div className="p-6">
                {currentScreen === 'dashboard' && <Dashboard />}
                {currentScreen === 'consent' && <ConsentLedger />}
                {currentScreen === 'campaign-studio' && <CampaignStudio />}
                {currentScreen === 'campaign-ops' && <CampaignOps />}
                {currentScreen === 'agent-sessions' && <AgentSessions />}
                {currentScreen === 'guided-flow' && <GuidedFlow />}
                {currentScreen === 'queue' && <QueueGroupPosting />}
                {currentScreen === 'intent-lab' && <IntentLab />}
                {currentScreen === 'audit' && <AuditTrail />}
              </div>
            </div>
          </div>
        </div>
      </AuditContext.Provider>
    </ConfigContext.Provider>
  );
}
