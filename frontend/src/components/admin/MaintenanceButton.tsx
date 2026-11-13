import { useEffect, useState } from 'react';
import { ImageDown, Loader2, Wand2 } from 'lucide-react';
import { api, type MaintenanceJob } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function MaintenanceButton({ type }: { type: 'optimize' | 'auto-fix' }) {
  const [job, setJob] = useState<MaintenanceJob | null>(null);
  const [starting, setStarting] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const next = await api.job(job.id, controller.signal);
        setJob(next);
        if (next.status !== 'running') {
          toast({ title: next.status === 'failed' ? 'Task failed' : 'Completed', description: `${next.updated} updated, ${next.skipped} skipped. ${next.errors.slice(0, 2).join(' | ')}`, variant: next.errors.length ? 'destructive' : 'default' });
          window.dispatchEvent(new Event('menuchange'));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setJob(null);
        toast({ title: 'Unable to check task', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
      }
    }, 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [job, toast]);
  const start = async () => {
    setStarting(true);
    try { setJob(await api.startJob(type)); }
    catch (error) { toast({ title: 'Error', description: error instanceof Error ? error.message : 'Unable to start task.', variant: 'destructive' }); }
    finally { setStarting(false); }
  };
  const busy = starting || job?.status === 'running';
  return <Button variant="outline" disabled={busy} onClick={start}>
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : type === 'optimize' ? <ImageDown className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
    {busy ? `Processing… ${job?.current || 0}/${job?.total || 0}` : type === 'optimize' ? 'Optimize Images' : 'Auto Fix All'}
  </Button>;
}
