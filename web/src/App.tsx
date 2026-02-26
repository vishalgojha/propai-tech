import React, { useEffect, useState } from 'react';
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

interface SettingsForm {
  businessPricePrefix: string;
  openrouterApiKey: string;
  openrouterModel: string;
  xaiApiKey: string;
  xaiModel: string;
}

type SafetyMode = 'preview' | 'guided_live' | 'autopilot';
type OperatorLanguage = 'en' | 'hi' | 'hinglish';

interface OperatorProfile {
  name: string;
  phone: string;
  city: string;
  lang: OperatorLanguage;
}

interface OnboardingState {
  step: 1 | 2 | 3;
  completed: boolean;
  skipped: boolean;
}

type GuidedAnswerValue = string | number | boolean | string[];
type GuidedStepKind = 'text' | 'number' | 'single_select';

interface GuidedStepOption {
  value: string;
  label: string;
}

interface GuidedStepView {
  id: string;
  label: string;
  prompt: string;
  kind: GuidedStepKind;
  required: boolean;
  placeholder?: string;
  options?: GuidedStepOption[];
  answered: boolean;
  answer?: GuidedAnswerValue;
  isCurrent: boolean;
  order: number;
}

interface GuidedFlowCompletion {
  generatedMessage: string;
  recommendedPlan: Array<{ tool: string; reason: string }>;
  suggestedExecution: {
    method: 'POST';
    endpoint: string;
    payload: Record<string, unknown>;
  };
}

interface GuidedFlowState {
  flowId: 'publish_listing';
  flowLabel: string;
  status: 'active' | 'completed';
  progressPercent: number;
  currentStepId?: string;
  currentPrompt?: string;
  steps: GuidedStepView[];
  completion?: GuidedFlowCompletion;
}

const STORAGE_KEYS = {
  settings: 'propai.ui.settings.v1',
  operator: 'propai.ui.operator.v1',
  onboarding: 'propai.ui.onboarding.v1',
  safetyMode: 'propai.ui.safety_mode.v1',
} as const;

const DEFAULT_SETTINGS_FORM: SettingsForm = {
  businessPricePrefix: 'Cr',
  openrouterApiKey: '',
  openrouterModel: 'openai/gpt-4o-mini',
  xaiApiKey: '',
  xaiModel: 'grok-2-latest'
};

const DEFAULT_OPERATOR_PROFILE: OperatorProfile = {
  name: '',
  phone: '',
  city: '',
  lang: 'en'
};

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  step: 1,
  completed: false,
  skipped: false
};

const SAFETY_MODE_META: Record<SafetyMode, {
  label: string;
  subtitle: string;
  dryRun: boolean;
  autonomy: 0 | 1 | 2;
}> = {
  preview: {
    label: 'Preview Only',
    subtitle: 'No real sends. Best for practice.',
    dryRun: true,
    autonomy: 0
  },
  guided_live: {
    label: 'Guided Live',
    subtitle: 'Real actions with approvals in control.',
    dryRun: false,
    autonomy: 1
  },
  autopilot: {
    label: 'Autopilot',
    subtitle: 'Fewer pauses for power operators.',
    dryRun: false,
    autonomy: 2
  }
};

const SAFETY_MODE_ORDER: SafetyMode[] = ['preview', 'guided_live', 'autopilot'];

const CONNECTOR_HELP_TEXT: Record<string, string> = {
  openrouter: 'Cloud AI provider',
  xai: 'Cloud AI provider',
  ollama: 'Local AI provider',
  wacli: 'WhatsApp messaging transport',
  wppconnect: 'Legacy WhatsApp bridge',
  propai: 'Property portal publishing bridge',
  postgres: 'Database storage',
  openclaw: 'Gateway connectivity'
};

const QUEUE_STATUS_LABEL: Record<QueueItem['status'], string> = {
  queued: 'Waiting',
  processing: 'Sending',
  sent: 'Completed',
  failed: 'Needs retry'
};

const CONNECTOR_STATUS_LABEL: Record<Connector['status'], string> = {
  healthy: 'Ready',
  warning: 'Needs attention',
  error: 'Issue'
};

const OPENROUTER_MODELS = [
  'openai/gpt-4o-mini',
  'openai/gpt-4.1-mini',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.7-sonnet',
  'google/gemini-2.0-flash',
  'meta-llama/llama-3.3-70b-instruct'
] as const;

const XAI_MODELS = [
  'grok-2-latest',
  'grok-2-vision-latest',
  'grok-beta'
] as const;

export const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');
  const [hydrated, setHydrated] = useState(false);
  const [publishResults, setPublishResults] = useState<PublishResult[]>([
    { id: 'PR-7842', date: 'Feb 24, 14:32', listingTitle: '3BHK Bandra West', portal: '99acres', externalId: '99A-938472', status: 'success' },
    { id: 'PR-7841', date: 'Feb 24, 13:19', listingTitle: '2BHK Andheri', portal: 'MagicBricks', externalId: 'MB-837462', status: 'success' },
    { id: 'PR-7840', date: 'Feb 24, 11:05', listingTitle: '4BHK Powai', portal: 'Both', externalId: '99A-837291 / MB-291837', status: 'failed', reason: 'Rate limit exceeded' },
  ]);

  const [connectors, setConnectors] = useState<Connector[]>([
    { id: 'openrouter', name: 'OpenRouter', status: 'healthy', lastPing: '12s ago' },
    { id: 'xai', name: 'xAI', status: 'healthy', lastPing: '18s ago' },
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

  const [settingsForm, setSettingsForm] = useState({ ...DEFAULT_SETTINGS_FORM });
  const [operatorProfile, setOperatorProfile] = useState<OperatorProfile>({ ...DEFAULT_OPERATOR_PROFILE });
  const [safetyMode, setSafetyMode] = useState<SafetyMode>('guided_live');
  const [onboarding, setOnboarding] = useState<OnboardingState>({ ...DEFAULT_ONBOARDING_STATE });
  const [settingsSavedAt, setSettingsSavedAt] = useState<string>('');

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
  const [guidedSessionId, setGuidedSessionId] = useState('');
  const [guidedFlow, setGuidedFlow] = useState<GuidedFlowState | null>(null);
  const [guidedAnswerInput, setGuidedAnswerInput] = useState('');
  const [guidedBusy, setGuidedBusy] = useState(false);
  const [guidedError, setGuidedError] = useState('');
  const [guidedInfo, setGuidedInfo] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const rawSettings = window.localStorage.getItem(STORAGE_KEYS.settings);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings) as Partial<typeof DEFAULT_SETTINGS_FORM>;
        setSettingsForm((prev) => ({
          ...prev,
          ...parsed,
        }));
      }
    } catch {
      // ignore malformed local settings
    }

    try {
      const rawOperator = window.localStorage.getItem(STORAGE_KEYS.operator);
      if (rawOperator) {
        const parsed = JSON.parse(rawOperator) as Partial<OperatorProfile>;
        setOperatorProfile((prev) => ({
          ...prev,
          ...parsed,
          lang: parsed.lang === 'hi' || parsed.lang === 'hinglish' ? parsed.lang : prev.lang
        }));
      }
    } catch {
      // ignore malformed local operator profile
    }

    try {
      const rawSafetyMode = window.localStorage.getItem(STORAGE_KEYS.safetyMode);
      if (rawSafetyMode === 'preview' || rawSafetyMode === 'guided_live' || rawSafetyMode === 'autopilot') {
        setSafetyMode(rawSafetyMode);
      }
    } catch {
      // ignore malformed local safety mode
    }

    try {
      const rawOnboarding = window.localStorage.getItem(STORAGE_KEYS.onboarding);
      if (rawOnboarding) {
        const parsed = JSON.parse(rawOnboarding) as Partial<OnboardingState>;
        const normalizedStep = parsed.step === 2 || parsed.step === 3 ? parsed.step : 1;
        setOnboarding({
          step: normalizedStep,
          completed: Boolean(parsed.completed),
          skipped: Boolean(parsed.skipped)
        });
      }
    } catch {
      // ignore malformed local onboarding state
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settingsForm));
  }, [settingsForm, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.operator, JSON.stringify(operatorProfile));
  }, [operatorProfile, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.safetyMode, safetyMode);
  }, [safetyMode, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.onboarding, JSON.stringify(onboarding));
  }, [onboarding, hydrated]);

  useEffect(() => {
    const targetDryRun = SAFETY_MODE_META[safetyMode].dryRun;
    setFormData((prev) => (prev.dryRun === targetDryRun ? prev : { ...prev, dryRun: targetDryRun }));
  }, [safetyMode]);

  useEffect(() => {
    if (activeScreen !== 'publish-studio') return;

    let cancelled = false;
    const loadGuided = async () => {
      try {
        setGuidedBusy(true);
        setGuidedError('');
        const sessionId = await ensureGuidedSession();
        if (cancelled) return;
        await refreshGuidedFlow(sessionId);
      } catch (error) {
        if (cancelled) return;
        setGuidedError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setGuidedBusy(false);
        }
      }
    };

    void loadGuided();
    return () => {
      cancelled = true;
    };
  }, [activeScreen]);

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'publish-studio' as const, label: 'Listing Publish Studio', icon: PenTool },
    { id: 'publish-results' as const, label: 'Publish Results', icon: CheckCircle },
    { id: 'portal-status' as const, label: 'Publishing Connections', icon: Activity },
    { id: 'whatsapp-connect' as const, label: 'WhatsApp Connect', icon: MessageCircle },
    { id: 'pairing-approval' as const, label: 'Pairing Approval', icon: UserCheck },
    { id: 'approvals-queue' as const, label: 'Approvals Queue', icon: Clock },
    { id: 'agent-session' as const, label: 'Agent Session', icon: Bot },
    { id: 'session-list' as const, label: 'Session List', icon: List },
    { id: 'group-intake' as const, label: 'Group Posting Intake', icon: Plus },
    { id: 'group-queue' as const, label: 'Outbox Queue', icon: Send },
    { id: 'dispatch-center' as const, label: 'Send Center', icon: Play },
    { id: 'connectors-center' as const, label: 'Service Connections', icon: Server },
    { id: 'wacli-tools' as const, label: 'WhatsApp Actions', icon: Zap },
    { id: 'queue-runtime' as const, label: 'Background Tasks', icon: Database },
    { id: 'properties' as const, label: 'Properties / Inventory', icon: Plus },
    { id: 'system-health' as const, label: 'Health Check', icon: HeartPulse },
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

  const saveSettings = () => {
    const stamp = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date());
    setSettingsSavedAt(stamp);
    if (!onboarding.completed && !onboarding.skipped && onboarding.step === 3) {
      setOnboarding((prev) => ({ ...prev, completed: true, skipped: false }));
    }
    alert('✅ Settings saved locally in this operator surface preview');
  };

  const onboardingProgress = onboarding.completed ? 100 : Math.round((onboarding.step / 3) * 100);
  const selectedSafetyMode = SAFETY_MODE_META[safetyMode];

  const handleOnboardingNext = () => {
    setOnboarding((prev) => {
      if (prev.completed) return prev;
      if (prev.step >= 3) {
        return { ...prev, completed: true, skipped: false };
      }
      return { ...prev, step: (prev.step + 1) as 1 | 2 | 3 };
    });
  };

  const handleOnboardingBack = () => {
    setOnboarding((prev) => {
      if (prev.completed || prev.step <= 1) return prev;
      return { ...prev, step: (prev.step - 1) as 1 | 2 | 3 };
    });
  };

  const handleOnboardingSkip = () => {
    setOnboarding((prev) => ({ ...prev, skipped: true }));
  };

  const handleOnboardingResume = () => {
    setOnboarding((prev) => ({ ...prev, skipped: false, completed: false }));
  };

  const handleOnboardingReset = () => {
    setOnboarding({ ...DEFAULT_ONBOARDING_STATE });
  };

  const postJson = async <T,>(endpoint: string, payload: Record<string, unknown>): Promise<T> => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({})) as { error?: string } & T;
    if (!response.ok) {
      throw new Error(body.error || `Request failed (${response.status})`);
    }
    return body;
  };

  const getJson = async <T,>(endpoint: string): Promise<T> => {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'content-type': 'application/json' }
    });
    const body = await response.json().catch(() => ({})) as { error?: string } & T;
    if (!response.ok) {
      throw new Error(body.error || `Request failed (${response.status})`);
    }
    return body;
  };

  const ensureGuidedSession = async (): Promise<string> => {
    if (guidedSessionId) return guidedSessionId;
    const body = await postJson<{ result: { session: { id: string } } }>(
      '/agent/session/start',
      {}
    );
    const id = body.result.session.id;
    setGuidedSessionId(id);
    return id;
  };

  const refreshGuidedFlow = async (sessionIdOverride?: string) => {
    const sessionId = sessionIdOverride || guidedSessionId || await ensureGuidedSession();
    const body = await getJson<{ result: { guidedFlow: GuidedFlowState | null } }>(
      `/guided/state?sessionId=${encodeURIComponent(sessionId)}`
    );
    setGuidedFlow(body.result.guidedFlow);
    return body.result.guidedFlow;
  };

  const startGuidedPublishFlow = async () => {
    setGuidedBusy(true);
    setGuidedError('');
    setGuidedInfo('');
    try {
      const sessionId = await ensureGuidedSession();
      const body = await postJson<{ result: { guidedFlow: GuidedFlowState } }>(
        '/guided/start',
        {
          sessionId,
          flowId: 'publish_listing'
        }
      );
      setGuidedFlow(body.result.guidedFlow);
      setGuidedAnswerInput('');
      setGuidedInfo('Guided flow started. Answer one step at a time.');
    } catch (error) {
      setGuidedError(error instanceof Error ? error.message : String(error));
    } finally {
      setGuidedBusy(false);
    }
  };

  const answerGuidedStep = async () => {
    if (!guidedFlow || guidedFlow.status !== 'active') return;
    const currentStep = guidedFlow.steps.find((step) => step.isCurrent);
    if (!currentStep) return;

    if (!guidedAnswerInput.trim()) {
      setGuidedError(`Please enter a value for "${currentStep.label}".`);
      return;
    }

    setGuidedBusy(true);
    setGuidedError('');
    setGuidedInfo('');
    try {
      const sessionId = guidedSessionId || await ensureGuidedSession();
      let answerValue: string | number = guidedAnswerInput.trim();
      if (currentStep.kind === 'number') {
        const parsed = Number(guidedAnswerInput.trim().replace(/,/g, ''));
        if (!Number.isFinite(parsed)) {
          setGuidedError(`"${currentStep.label}" expects a number.`);
          setGuidedBusy(false);
          return;
        }
        answerValue = parsed;
      }

      const body = await postJson<{ result: { guidedFlow: GuidedFlowState } }>(
        '/guided/answer',
        {
          sessionId,
          stepId: currentStep.id,
          answer: answerValue
        }
      );
      setGuidedFlow(body.result.guidedFlow);
      setGuidedAnswerInput('');
      if (body.result.guidedFlow.status === 'completed') {
        setGuidedInfo('Guided flow completed. Review generated request and send it to agent queue.');
      } else {
        setGuidedInfo('Step saved.');
      }
    } catch (error) {
      setGuidedError(error instanceof Error ? error.message : String(error));
    } finally {
      setGuidedBusy(false);
    }
  };

  const executeGuidedCompletion = async () => {
    if (!guidedFlow?.completion) return;

    setGuidedBusy(true);
    setGuidedError('');
    setGuidedInfo('');
    try {
      const execution = guidedFlow.completion.suggestedExecution;
      const response = await fetch(execution.endpoint, {
        method: execution.method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(execution.payload)
      });
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        result?: {
          response?: {
            plan?: Array<{ tool: string; reason: string }>;
            queuedActions?: Array<{ tool: string }>;
          };
        };
      };

      if (!response.ok) {
        throw new Error(body.error || `Request failed (${response.status})`);
      }

      const plan = body.result?.response?.plan || [];
      const queuedActions = body.result?.response?.queuedActions || [];
      const planSummary = plan.length > 0
        ? `Plan: ${plan.map((item) => item.tool).join(', ')}`
        : 'No plan returned.';
      const queuedSummary = queuedActions.length > 0
        ? `Queued: ${queuedActions.map((item) => item.tool).join(', ')}`
        : 'Nothing queued.';

      setCurrentAgentSession(prev => [
        ...prev,
        { role: 'system', text: `Guided execution sent. ${planSummary} ${queuedSummary}` }
      ]);
      setGuidedInfo('Guided request sent to agent session queue.');
      setActiveScreen('agent-session');
    } catch (error) {
      setGuidedError(error instanceof Error ? error.message : String(error));
    } finally {
      setGuidedBusy(false);
    }
  };

  const healthyConnectors = connectors.filter((item) => item.status === 'healthy').length;
  const allConnectorsHealthy = healthyConnectors === connectors.length;
  const currentGuidedStep = guidedFlow?.steps.find((step) => step.isCurrent);

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
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <span className="px-3 py-1 rounded-3xl bg-emerald-500/10 text-emerald-300">
                  {selectedSafetyMode.label}
                </span>
                <span>dryRun={selectedSafetyMode.dryRun ? 'on' : 'off'}</span>
                <span>autonomy={selectedSafetyMode.autonomy}</span>
                {onboarding.completed ? (
                  <span className="px-3 py-1 rounded-3xl bg-emerald-500/10 text-emerald-300">Setup complete</span>
                ) : onboarding.skipped ? (
                  <span className="px-3 py-1 rounded-3xl bg-amber-500/10 text-amber-300">Setup paused</span>
                ) : (
                  <span className="px-3 py-1 rounded-3xl bg-zinc-800 text-zinc-300">Setup {onboardingProgress}%</span>
                )}
              </div>
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
                  <div className="text-4xl font-bold">{healthyConnectors}/{connectors.length}</div>
                  <div className={`text-xs mt-4 ${allConnectorsHealthy ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {allConnectorsHealthy ? 'All healthy' : 'Some need attention'}
                  </div>
                </div>
                <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
                  <div className="text-sm text-zinc-400 mb-2">Queue Depth</div>
                  <div className="text-4xl font-bold">42</div>
                  <div className="text-xs text-amber-400 mt-4">2 processing</div>
                </div>
              </div>

              {!onboarding.completed && !onboarding.skipped && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xl font-semibold">First-Time Setup</div>
                      <div className="text-sm text-zinc-400 mt-1">Complete these 3 steps once. We will remember your progress.</div>
                    </div>
                    <div className="text-sm text-zinc-400">Step {onboarding.step}/3</div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${onboardingProgress}%` }} />
                  </div>

                  {onboarding.step === 1 && (
                    <div className="space-y-3">
                      <div className="text-sm text-zinc-300">Choose how controlled execution should be.</div>
                      <div className="grid grid-cols-3 gap-4">
                        {SAFETY_MODE_ORDER.map((modeId) => {
                          const mode = SAFETY_MODE_META[modeId];
                          const selected = safetyMode === modeId;
                          return (
                            <button
                              key={modeId}
                              onClick={() => setSafetyMode(modeId)}
                              className={`text-left rounded-3xl border p-4 transition-colors ${selected ? 'border-emerald-400 bg-emerald-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}
                            >
                              <div className="font-medium">{mode.label}</div>
                              <div className="text-xs text-zinc-400 mt-2">{mode.subtitle}</div>
                              <div className="text-xs text-zinc-500 mt-2">dryRun={mode.dryRun ? 'on' : 'off'} · autonomy={mode.autonomy}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {onboarding.step === 2 && (
                    <div className="space-y-4">
                      <div className="text-sm text-zinc-300">Set your operator defaults for faster daily operations.</div>
                      <div className="grid grid-cols-2 gap-4">
                        <input
                          value={operatorProfile.name}
                          onChange={(e) => setOperatorProfile({ ...operatorProfile, name: e.target.value })}
                          placeholder="Operator name"
                          className="w-full rounded-3xl py-3 px-5 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input
                          value={operatorProfile.phone}
                          onChange={(e) => setOperatorProfile({ ...operatorProfile, phone: e.target.value })}
                          placeholder="Default phone (+E164)"
                          className="w-full rounded-3xl py-3 px-5 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input
                          value={operatorProfile.city}
                          onChange={(e) => setOperatorProfile({ ...operatorProfile, city: e.target.value })}
                          placeholder="Default city"
                          className="w-full rounded-3xl py-3 px-5 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <select
                          value={operatorProfile.lang}
                          onChange={(e) => setOperatorProfile({ ...operatorProfile, lang: e.target.value as OperatorLanguage })}
                          className="w-full rounded-3xl py-3 px-5 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="en">en</option>
                          <option value="hi">hi</option>
                          <option value="hinglish">hinglish</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {onboarding.step === 3 && (
                    <div className="bg-zinc-800/70 rounded-3xl p-5 space-y-2 text-sm text-zinc-300">
                      <div>Safety mode: <span className="text-white">{selectedSafetyMode.label}</span></div>
                      <div>Operator: <span className="text-white">{operatorProfile.name || 'Not set'}</span></div>
                      <div>Phone: <span className="text-white">{operatorProfile.phone || 'Not set'}</span></div>
                      <div>City: <span className="text-white">{operatorProfile.city || 'Not set'}</span></div>
                      <div>Language: <span className="text-white">{operatorProfile.lang}</span></div>
                      <div className="text-zinc-400 pt-2">You can edit these any time from Settings.</div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleOnboardingSkip}
                      className="px-4 py-2 rounded-3xl border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-colors"
                    >
                      Skip for now
                    </button>
                    <button
                      onClick={handleOnboardingBack}
                      disabled={onboarding.step === 1}
                      className="px-4 py-2 rounded-3xl border border-zinc-700 text-zinc-300 disabled:opacity-40 hover:border-zinc-500 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleOnboardingNext}
                      className="px-6 py-2 rounded-3xl bg-emerald-600 hover:bg-emerald-700 transition-colors font-medium"
                    >
                      {onboarding.step === 3 ? 'Finish setup' : 'Next'}
                    </button>
                  </div>
                </div>
              )}

              {onboarding.skipped && !onboarding.completed && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-6 flex items-center justify-between">
                  <div className="text-sm text-amber-200">Setup is paused. Resume onboarding when you are ready.</div>
                  <button
                    onClick={handleOnboardingResume}
                    className="px-5 py-2 rounded-3xl bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 transition-colors"
                  >
                    Resume setup
                  </button>
                </div>
              )}

              {onboarding.completed && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-6 flex items-center justify-between">
                  <div className="text-sm text-emerald-200">Setup complete. Defaults are saved and will resume automatically.</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveScreen('settings')}
                      className="px-5 py-2 rounded-3xl border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/20 transition-colors"
                    >
                      Open settings
                    </button>
                    <button
                      onClick={handleOnboardingReset}
                      className="px-5 py-2 rounded-3xl border border-zinc-600 text-zinc-300 hover:border-zinc-500 transition-colors"
                    >
                      Reset setup
                    </button>
                  </div>
                </div>
              )}

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
                  <div className="bg-zinc-900 rounded-3xl p-8 space-y-5 border border-zinc-800">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xl font-semibold">Guided Publish Sequence</div>
                        <div className="text-sm text-zinc-400 mt-1">
                          Step-by-step flow for non-technical operators. No guesswork.
                        </div>
                        <div className="text-xs text-zinc-500 mt-2">
                          Session: {guidedSessionId || 'initializing...'}
                        </div>
                      </div>
                      <button
                        onClick={startGuidedPublishFlow}
                        disabled={guidedBusy}
                        className="px-5 py-3 rounded-3xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                      >
                        {guidedFlow ? 'Restart Flow' : 'Start Flow'}
                      </button>
                    </div>

                    {guidedFlow && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 text-sm">
                          <span className={`px-3 py-1 rounded-3xl ${guidedFlow.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                            {guidedFlow.status === 'completed' ? 'Completed' : 'In Progress'}
                          </span>
                          <span className="text-zinc-400">
                            {guidedFlow.progressPercent}% complete
                          </span>
                        </div>

                        {guidedFlow.status === 'active' && currentGuidedStep && (
                          <div className="bg-zinc-800 rounded-2xl p-5 space-y-4">
                            <div className="text-sm text-zinc-300">
                              Step {currentGuidedStep.order}: {currentGuidedStep.label}
                            </div>
                            <div className="text-zinc-200">{currentGuidedStep.prompt}</div>
                            {currentGuidedStep.options && currentGuidedStep.options.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {currentGuidedStep.options.map((option) => (
                                  <button
                                    key={option.value}
                                    onClick={() => setGuidedAnswerInput(option.value)}
                                    className="px-4 py-2 rounded-3xl border border-zinc-600 hover:border-zinc-300 text-sm transition-colors"
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            )}
                            <input
                              value={guidedAnswerInput}
                              onChange={(e) => setGuidedAnswerInput(e.target.value)}
                              placeholder={currentGuidedStep.placeholder || 'Type your answer'}
                              className="w-full bg-zinc-900 rounded-3xl py-3 px-5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <button
                              onClick={answerGuidedStep}
                              disabled={guidedBusy}
                              className="px-5 py-3 rounded-3xl bg-white text-black hover:bg-zinc-200 disabled:opacity-60 transition-colors"
                            >
                              Save Step
                            </button>
                          </div>
                        )}

                        {guidedFlow.status === 'completed' && guidedFlow.completion && (
                          <div className="bg-zinc-800 rounded-2xl p-5 space-y-4">
                            <div className="text-sm text-zinc-300">Generated request</div>
                            <div className="text-zinc-100">{guidedFlow.completion.generatedMessage}</div>
                            <div className="text-sm text-zinc-400">Recommended tools</div>
                            <div className="flex flex-wrap gap-2">
                              {guidedFlow.completion.recommendedPlan.map((item) => (
                                <span key={`${item.tool}-${item.reason}`} className="px-3 py-1 rounded-3xl bg-zinc-700 text-xs text-zinc-200">
                                  {item.tool}
                                </span>
                              ))}
                            </div>
                            <button
                              onClick={executeGuidedCompletion}
                              disabled={guidedBusy}
                              className="px-5 py-3 rounded-3xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                            >
                              Send To Agent Queue
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {guidedInfo && <div className="text-sm text-emerald-300">{guidedInfo}</div>}
                    {guidedError && <div className="text-sm text-red-300">{guidedError}</div>}
                  </div>

                  <div className="bg-zinc-900 rounded-3xl p-8 space-y-6">
                    <div className="text-sm uppercase tracking-widest text-zinc-500">Manual Publish Form</div>
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
              <div className="text-3xl font-semibold mb-2">Publishing Connections</div>
              <div className="text-zinc-400">These links let PropAI post listings to 99acres and MagicBricks.</div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 text-sm text-zinc-300">
                What to do: if either card below is not connected, open Settings and update your publish URL or API key.
              </div>

              {/* 99acres Adapter */}
              <div className="bg-zinc-900 rounded-3xl p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl">🇮🇳</div>
                    <div>
                      <div className="text-2xl font-semibold">99acres Adapter</div>
                      <div className="text-emerald-400 text-sm">Posting endpoint</div>
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
                      <div className="text-emerald-400 text-sm">Posting endpoint</div>
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
                <div className="uppercase text-xs tracking-widest mb-1">Publishing API Key</div>
                <div className="font-mono text-lg break-all">{propaiEnv.PROPAI_LIVE_API_KEY.value}</div>
                <div className="mt-6 flex items-center gap-2 text-emerald-400">
                  <div className="w-4 h-4 bg-emerald-500 rounded-full" /> Fully ready for both adapters
                </div>
              </div>
            </div>
          )}

          {activeScreen === 'connectors-center' && (
            <div>
              <div className="text-3xl font-semibold mb-3">Service Connections ({connectors.length})</div>
              <div className="text-zinc-400 mb-8">Each card shows one service PropAI depends on. If a card says "Needs attention", click check now.</div>
              <div className="grid grid-cols-3 gap-6">
                {connectors.map(connector => (
                  <div key={connector.id} className={`bg-zinc-900 rounded-3xl p-8 transition-all hover:-translate-y-1 ${connector.special ? 'ring-2 ring-offset-4 ring-offset-zinc-950 ring-emerald-500' : ''}`}>
                    <div className="flex justify-between">
                      <div className="text-2xl font-medium">{connector.name}</div>
                      <div className={`px-5 py-1 text-xs rounded-3xl font-medium ${connector.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-400' : connector.status === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                        {CONNECTOR_STATUS_LABEL[connector.status]}
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-zinc-400">{CONNECTOR_HELP_TEXT[connector.id] || 'Connected service'}</div>
                    <div className="mt-8 text-xs text-zinc-500">Last checked</div>
                    <div className="text-4xl font-mono tracking-tighter text-white/70">{connector.lastPing}</div>
                    
                    {connector.special && (
                      <div className="mt-6 text-[10px] text-emerald-400">• Explicit 99acres &amp; MagicBricks support</div>
                    )}

                    <button 
                      onClick={() => testConnector(connector.id)}
                      className="mt-10 w-full py-4 border border-zinc-700 hover:border-white rounded-3xl text-sm transition-colors"
                    >
                      Check now
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
            <div className="max-w-2xl mx-auto bg-zinc-900 border border-zinc-800 rounded-3xl p-8 space-y-4">
              <div className="text-2xl font-semibold">Approval Queue</div>
              <div className="text-zinc-300">Nothing runs silently. You review sensitive actions before they go live.</div>
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div className="bg-zinc-800 rounded-2xl p-4">
                  <div className="text-xs text-zinc-400">Pending now</div>
                  <div className="text-2xl font-semibold">0</div>
                </div>
                <div className="bg-zinc-800 rounded-2xl p-4">
                  <div className="text-xs text-zinc-400">High priority</div>
                  <div className="text-2xl font-semibold">0</div>
                </div>
                <div className="bg-zinc-800 rounded-2xl p-4">
                  <div className="text-xs text-zinc-400">Needs review first</div>
                  <div className="text-2xl font-semibold">None</div>
                </div>
              </div>
              <div className="text-sm text-zinc-400">When actions arrive, they will appear here with clear approve/deny buttons.</div>
            </div>
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
            <div className="space-y-4">
              <div className="text-zinc-300">Outbox queue shows what is waiting to be sent, currently sending, done, or needing retry.</div>
              <div className="bg-zinc-900 rounded-3xl">
                <div className="flex border-b border-zinc-800">
                  {(['queued', 'processing', 'sent', 'failed'] as const).map(s => (
                    <button key={s} className={`flex-1 py-5 text-sm font-medium transition-colors ${queueItems[0]?.status === s ? 'border-b-2 border-white' : 'text-zinc-400'}`}>
                      {QUEUE_STATUS_LABEL[s]} ({queueItems.filter(i => i.status === s).length})
                    </button>
                  ))}
                </div>
                {queueItems.map(item => (
                  <div key={item.id} className="p-8 border-b border-zinc-800 flex justify-between items-center">
                    <div>
                      <div>{item.content}</div>
                      <div className="text-xs text-zinc-400 mt-1">Status: {QUEUE_STATUS_LABEL[item.status]} · Target: {item.targets}</div>
                    </div>
                    <button onClick={() => alert('Requeued')} className="text-xs px-6 py-2 border border-zinc-700 rounded-3xl hover:border-white transition-colors">Try again</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeScreen === 'dispatch-center' && (
            <div className="max-w-md mx-auto text-center py-20">
              <div className="text-zinc-300 mb-8">Use this when you want to send due items immediately.</div>
              <button onClick={() => alert('🚀 Manual dispatch triggered')} className="bg-white text-xl text-black px-16 py-8 rounded-3xl font-semibold hover:bg-zinc-100 transition-colors">Send due items now</button>
              <div className="mt-16 text-zinc-500">Last auto-run: 11 minutes ago</div>
            </div>
          )}

          {activeScreen === 'wacli-tools' && (
            <div>
              <div className="text-zinc-300 mb-6">WhatsApp Actions help you send a message, search chats, and run quick connection checks.</div>
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
                  <input placeholder="Recipient phone or group ID" className="w-full rounded-3xl py-6 px-8 bg-zinc-900 mb-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <textarea placeholder="Type your message" className="w-full h-52 rounded-3xl py-6 px-8 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <button onClick={() => setWacliOutput('✅ Message sent successfully')} className="mt-6 w-full py-6 bg-emerald-600 rounded-3xl hover:bg-emerald-700 transition-colors">Send message</button>
                  {wacliOutput && <div className="mt-6 text-emerald-400 text-center font-medium">{wacliOutput}</div>}
                </div>
              )}
            </div>
          )}

          {activeScreen === 'queue-runtime' && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-12 max-w-lg mx-auto text-center">
              <div className="text-6xl mb-6">✅</div>
              <div className="text-3xl font-medium">Background Task Engine is healthy</div>
              <div className="text-emerald-400 mt-3">Auto-send queue is running normally</div>
              <div className="text-zinc-300 mt-4">No action needed right now.</div>
            </div>
          )}

          {activeScreen === 'properties' && <div className="text-center py-40 text-6xl text-zinc-700 font-light">Properties Inventory<br />(/properties table)</div>}

          {activeScreen === 'system-health' && (
            <div className="max-w-3xl space-y-6">
              <div className="text-zinc-300">Quick health check for core services.</div>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-zinc-900 rounded-3xl p-8">
                  <div className="text-sm text-zinc-400 mb-2">App status</div>
                  <div className="text-2xl font-semibold text-emerald-400">Running</div>
                </div>
                <div className="bg-zinc-900 rounded-3xl p-8">
                  <div className="text-sm text-zinc-400 mb-2">Webhook status</div>
                  <div className="text-2xl font-semibold text-emerald-400">Connected</div>
                </div>
              </div>
              <div className="bg-zinc-900 rounded-3xl p-5 text-sm text-zinc-400">
                If either item is not green, go to Service Connections and run checks.
              </div>
            </div>
          )}

          {activeScreen === 'settings' && (
            <div className="max-w-2xl space-y-8">
              <div className="bg-zinc-900 rounded-3xl p-8 space-y-6">
                <div className="font-medium text-lg">Business Profile Defaults</div>
                <div>
                  <label className="block text-sm font-medium mb-3">Default Price Prefix</label>
                  <input
                    className="w-full rounded-3xl py-4 px-6 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Cr"
                    value={settingsForm.businessPricePrefix}
                    onChange={(e) => setSettingsForm({ ...settingsForm, businessPricePrefix: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-3">Operator Name</label>
                    <input
                      value={operatorProfile.name}
                      onChange={(e) => setOperatorProfile({ ...operatorProfile, name: e.target.value })}
                      placeholder="Name"
                      className="w-full rounded-3xl py-4 px-6 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-3">Default Phone</label>
                    <input
                      value={operatorProfile.phone}
                      onChange={(e) => setOperatorProfile({ ...operatorProfile, phone: e.target.value })}
                      placeholder="+91..."
                      className="w-full rounded-3xl py-4 px-6 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-3">Default City</label>
                    <input
                      value={operatorProfile.city}
                      onChange={(e) => setOperatorProfile({ ...operatorProfile, city: e.target.value })}
                      placeholder="City"
                      className="w-full rounded-3xl py-4 px-6 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-3">Language</label>
                    <select
                      value={operatorProfile.lang}
                      onChange={(e) => setOperatorProfile({ ...operatorProfile, lang: e.target.value as OperatorLanguage })}
                      className="w-full rounded-3xl py-4 px-6 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="en">en</option>
                      <option value="hi">hi</option>
                      <option value="hinglish">hinglish</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-medium">Safety Mode</label>
                  <div className="grid grid-cols-3 gap-3">
                    {SAFETY_MODE_ORDER.map((modeId) => (
                      <button
                        key={modeId}
                        onClick={() => setSafetyMode(modeId)}
                        className={`rounded-3xl border p-3 text-left transition-colors ${safetyMode === modeId ? 'border-emerald-400 bg-emerald-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}
                      >
                        <div className="text-sm font-medium">{SAFETY_MODE_META[modeId].label}</div>
                        <div className="text-[11px] text-zinc-400 mt-1">{SAFETY_MODE_META[modeId].subtitle}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-3xl p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-lg">LLM Providers</div>
                    <div className="text-sm text-zinc-400 mt-1">Configure cloud fallback providers used by chat and agent flows.</div>
                  </div>
                  <div className="px-4 py-2 bg-zinc-800 rounded-3xl text-xs text-zinc-300">
                    Priority: OpenRouter → xAI → Ollama
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <div className="text-sm font-medium mb-3">OpenRouter API Key</div>
                    <input
                      type="password"
                      value={settingsForm.openrouterApiKey}
                      onChange={(e) => setSettingsForm({ ...settingsForm, openrouterApiKey: e.target.value })}
                      placeholder="sk-or-..."
                      className="w-full rounded-3xl py-4 px-6 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm font-medium mb-3">OpenRouter Model</div>
                    <select
                      value={settingsForm.openrouterModel}
                      onChange={(e) => setSettingsForm({ ...settingsForm, openrouterModel: e.target.value })}
                      className="w-full rounded-3xl py-4 px-6 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {OPENROUTER_MODELS.map((modelId) => (
                        <option key={modelId} value={modelId}>
                          {modelId}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-zinc-500 mt-2">Model selection is attached to this API key configuration.</div>
                  </div>
                </div>

                <div className="h-px bg-zinc-800" />

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <div className="text-sm font-medium mb-3">xAI API Key</div>
                    <input
                      type="password"
                      value={settingsForm.xaiApiKey}
                      onChange={(e) => setSettingsForm({ ...settingsForm, xaiApiKey: e.target.value })}
                      placeholder="xai-..."
                      className="w-full rounded-3xl py-4 px-6 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm font-medium mb-3">xAI Model</div>
                    <select
                      value={settingsForm.xaiModel}
                      onChange={(e) => setSettingsForm({ ...settingsForm, xaiModel: e.target.value })}
                      className="w-full rounded-3xl py-4 px-6 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {XAI_MODELS.map((modelId) => (
                        <option key={modelId} value={modelId}>
                          {modelId}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-zinc-500 mt-2">Model selection is attached to this API key configuration.</div>
                  </div>
                </div>

                <button
                  onClick={saveSettings}
                  className="w-full py-4 bg-white text-black rounded-3xl hover:bg-zinc-100 transition-colors font-medium"
                >
                  Save Settings
                </button>
                {settingsSavedAt && (
                  <div className="text-xs text-emerald-400 text-center">Saved at {settingsSavedAt}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
