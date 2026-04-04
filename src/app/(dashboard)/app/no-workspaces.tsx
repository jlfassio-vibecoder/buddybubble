import { createWorkspace } from './actions';
import { Button } from '@/components/ui/button';

export function NoWorkspaces() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-lg font-semibold">Create your first workspace</h1>
        <p className="text-sm text-muted-foreground">
          You are not a member of any workspace yet. Create one to get started.
        </p>
        <form action={createWorkspace} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Workspace name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="My team"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="category_type" className="mb-1 block text-sm font-medium">
              Category
            </label>
            <select
              id="category_type"
              name="category_type"
              defaultValue="business"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="business">Business</option>
              <option value="kids">Kids</option>
              <option value="class">Class</option>
            </select>
          </div>
          <Button type="submit" className="w-full">
            Create workspace
          </Button>
        </form>
      </div>
    </main>
  );
}
