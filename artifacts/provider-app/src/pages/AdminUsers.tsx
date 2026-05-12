import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ApiError,
  getListUsersQueryKey,
  useListUsers,
  useUpdateUser,
  type AdminUser,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const query = useListUsers();
  const updateUser = useUpdateUser();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
  }

  async function setRole(user: AdminUser, nextRole: "admin" | "member") {
    if (user.role === nextRole) return;
    try {
      await updateUser.mutateAsync({ id: user.id, data: { role: nextRole } });
      invalidate();
      toast.success(
        `${user.displayName} is now ${nextRole === "admin" ? "an admin" : "a member"}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        const code =
          err.data &&
          typeof err.data === "object" &&
          "error" in err.data &&
          typeof (err.data as { error: unknown }).error === "string"
            ? ((err.data as { error: string }).error)
            : null;
        toast.error(
          code === "cannot_demote_self"
            ? "You can't demote your own admin role."
            : "Forbidden.",
        );
      } else {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to patients
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
        <p className="text-(--color-muted-foreground)">
          Promote or demote provider accounts. Admins can read the audit log
          and manage users.
        </p>
      </header>

      {query.isPending ? (
        <p className="text-(--color-muted-foreground)">Loading…</p>
      ) : query.isError ? (
        <ErrorMessage error={query.error} />
      ) : query.data.data.length === 0 ? (
        <Card className="p-10 text-center text-(--color-muted-foreground)">
          No users yet.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-(--color-muted) text-left text-(--color-muted-foreground)">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((user) => {
                const isSelf = user.id === currentUser?.id;
                return (
                  <tr
                    key={user.id}
                    className="border-t border-(--color-border)"
                  >
                    <td className="px-4 py-3 font-medium">
                      {user.displayName}
                      {isSelf ? (
                        <span className="ml-1 text-xs text-(--color-muted-foreground)">
                          (you)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-(--color-muted-foreground)">
                      {user.email}
                    </td>
                    <td className="px-4 py-3 text-(--color-muted-foreground) whitespace-nowrap">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={
                            user.role === "admin" ? "default" : "outline"
                          }
                          onClick={() => void setRole(user, "admin")}
                          disabled={
                            updateUser.isPending || user.role === "admin"
                          }
                        >
                          Admin
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            user.role === "member" ? "default" : "outline"
                          }
                          onClick={() => void setRole(user, "member")}
                          disabled={
                            updateUser.isPending ||
                            user.role === "member" ||
                            // UI guard mirroring the server-side check.
                            (isSelf && user.role === "admin")
                          }
                          title={
                            isSelf && user.role === "admin"
                              ? "You can't demote your own admin role"
                              : undefined
                          }
                        >
                          Member
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function ErrorMessage({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 403) {
    return (
      <Card className="p-10 text-center">
        <h2 className="text-lg font-medium">Admins only</h2>
        <p className="mt-2 text-sm text-(--color-muted-foreground)">
          Your account doesn't have permission to manage users.
        </p>
      </Card>
    );
  }
  return (
    <p className="text-(--color-destructive)">
      Couldn't load users. {error instanceof Error ? error.message : ""}
    </p>
  );
}
