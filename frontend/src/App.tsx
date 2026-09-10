import { useState, useEffect } from "react";
import type {
  AccessLevel,
  Connection,
  SchemaSnapshot,
  Chat,
  Workspace,
  WorkspaceRole,
  SavedQuery,
} from "./type";
import { api, setAuthToken } from "./api/client";
import { Database, MessageSquarePlus, X } from "lucide-react";

import LandingPage from "./components/LandingPage";
import LoginPage from "./components/LoginPage";
import SignupPage from "./components/SignupPage";
import Dashboard from "./components/Dashboard";
import Sidebar from "./components/Sidebar";
import ConnectionForm from "./components/ConnectionForm";
import ChatThread from "./components/ChatThread";
import SettingsPage from "./components/SettingsPage";
import WorkspaceMembersModal from "./components/WorkspaceMembersModal";
import ConnectionAccessModal from "./components/ConnectionAccessModal";
import AppHeader from "./components/AppHeader";
import { PhantomMark } from "./components/PhantomLogo";
import { Alert, Button, EmptyState } from "./components/ui";

export default function App() {
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [authToken, setAuthTokenState] = useState<string | null>(() =>
    localStorage.getItem("authToken")
  );
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [userName, setUserName] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [currentView, setCurrentView] = useState<"dashboard" | "query" | "profile">("dashboard");

  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaSnapshot | null>(null);
  const [showConnectionForm, setShowConnectionForm] = useState(false);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [startingChat, setStartingChat] = useState(false);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [membersModal, setMembersModal] = useState<{ workspaceId: string; workspaceName: string } | null>(null);

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // The signed-in user's role, tagged with the workspace it was fetched for.
  // Storing the workspace id alongside the role is what makes the derived
  // value below safe: a role fetched for the previous workspace can never be
  // used while a different one is on screen.
  const [workspaceMembership, setWorkspaceMembership] = useState<{
    workspaceId: string;
    role: WorkspaceRole | null;
  } | null>(null);
  const [accessModal, setAccessModal] = useState<Connection | null>(null);

  const activeWorkspaceRole =
    workspaceMembership && workspaceMembership.workspaceId === activeWorkspaceId
      ? workspaceMembership.role
      : null;

  // Drives which controls are offered. The backend enforces the real rule --
  // hiding a control is presentation, never protection.
  const canManageAccess =
    activeWorkspaceRole === "owner" || activeWorkspaceRole === "admin";

  const [error, setError] = useState<string | null>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  const activeConnection = connections.find((c) => c.id === activeConnectionId) ?? null;

  useEffect(() => {
    if (!activeWorkspaceId) return;
    api.listSavedQueries(activeWorkspaceId).then(setSavedQueries).catch(() => setSavedQueries([]));
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!authToken) return;
    setAuthToken(authToken);

    // Restore identity after a page refresh. The token survives in
    // localStorage but currentUserId/userName only ever existed in memory,
    // so on reload the app didn't know who was signed in -- which left the
    // members panel unable to work out the current user's role, and
    // therefore silently showing no role controls at all.
    api
      .getProfile()
      .then((profile) => {
        setCurrentUserId(profile.id);
        setUserName(profile.name);
      })
      .catch(() => {
        // Token expired or revoked: drop it rather than sitting in a
        // half-authenticated state.
        localStorage.removeItem("authToken");
        setAuthToken(null);
        setAuthTokenState(null);
      });
  }, []);

  useEffect(() => {
    if (!authToken) return;
    api.listWorkspaces().then((ws) => {
      setWorkspaces(ws);
      const personal = ws.find((w) => w.type === "personal");
      setActiveWorkspaceId(personal?.id ?? ws[0]?.id ?? null);
    });
  }, [authToken]);

  // Resolve the caller's role in the active workspace. Needs currentUserId,
  // which arrives asynchronously on a page refresh, so this depends on both.
  // Nothing is written synchronously here: until the fetch lands, the
  // derived activeWorkspaceRole is null and no admin control is offered.
  useEffect(() => {
    if (!authToken || !activeWorkspaceId || !currentUserId) return;

    const workspaceId = activeWorkspaceId;
    let cancelled = false;

    api
      .getWorkspaceMembers(workspaceId)
      .then((members) => {
        if (cancelled) return;
        setWorkspaceMembership({
          workspaceId,
          role: members.find((m) => m.user_id === currentUserId)?.role ?? null,
        });
      })
      .catch(() => {
        // Fail closed: an unknown role offers no admin controls.
        if (!cancelled) setWorkspaceMembership({ workspaceId, role: null });
      });

    return () => {
      cancelled = true;
    };
  }, [authToken, activeWorkspaceId, currentUserId]);

  useEffect(() => {
    if (!authToken || !activeWorkspaceId) return;
    let cancelled = false;
    setConnectionsLoading(true);
    api
      .listConnections(activeWorkspaceId)
      .then((list) => {
        if (!cancelled) setConnections(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load connections");
      })
      .finally(() => {
        if (!cancelled) setConnectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, activeWorkspaceId]);

  useEffect(() => {
    setActiveConnectionId(null);
    setSchema(null);
    setChats([]);
    setActiveChatId(null);
  }, [activeWorkspaceId]);

  // Closing the drawer whenever the workspace pane changes keeps a mobile user
  // from landing on a screen hidden behind their own navigation.
  useEffect(() => {
    setSidebarOpen(false);
  }, [currentView, activeChatId]);

  // Escape closes the mobile drawer, matching every other dismissible surface.
  useEffect(() => {
    if (!sidebarOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  async function handleSelectConnection(id: string) {
    setSidebarOpen(false);
    setActiveConnectionId(id);
    setActiveChatId(null);
    try {
      const snapshot = await api.getSchema(id);
      setSchema(snapshot);

      const chatList = await api.getChatsForConnection(id);
      setChats(chatList);
      setActiveChatId(chatList.length > 0 ? chatList[0].id : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schema");
    }
  }

  async function handleNewChat() {
    if (!activeConnectionId || !activeWorkspaceId) return;
    setStartingChat(true);
    try {
      const chat = await api.createChat(activeConnectionId, activeWorkspaceId);
      setChats((prev) => [chat, ...prev]);
      setActiveChatId(chat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start a new chat");
    } finally {
      setStartingChat(false);
    }
  }

  async function handleDeleteConnection(id: string) {
    try {
      await api.deleteConnection(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      if (activeConnectionId === id) {
        setActiveConnectionId(null);
        setSchema(null);
        setChats([]);
        setActiveChatId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete connection");
    }
  }

  async function handleCreateTeamWorkspace(name: string) {
    const ws = await api.createWorkspace(name);
    setWorkspaces((prev) => [...prev, ws]);
    setActiveWorkspaceId(ws.id);
  }

  async function handleLogin(email: string, password: string) {
    const result = await api.login(email, password);
    localStorage.setItem("authToken", result.access_token);
    setAuthToken(result.access_token);
    setAuthTokenState(result.access_token);
    setUserName(result.name);
    setCurrentUserId(result.user_id);
  }

  async function handleSignup(email: string, name: string, password: string) {
    const result = await api.signup(email, name, password);
    localStorage.setItem("authToken", result.access_token);
    setAuthToken(result.access_token);
    setAuthTokenState(result.access_token);
    setUserName(result.name);
    setCurrentUserId(result.user_id);
  }

  function handleLogout() {
    localStorage.removeItem("authToken");
    setAuthToken(null);
    setAuthTokenState(null);
    setConnections([]);
    setActiveConnectionId(null);
    setSchema(null);
    setChats([]);
    setActiveChatId(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setSavedQueries([]);
    setCurrentUserId("");
    setCurrentView("dashboard");
  }

  async function handleOpenSavedQuery(q: SavedQuery) {
    await handleSelectConnection(q.connection_id);
    setPendingQuestion(q.question);
    setCurrentView("query");
  }

  async function handleDeleteSavedQuery(id: string) {
    await api.deleteSavedQuery(id);
    setSavedQueries((prev) => prev.filter((q) => q.id !== id));
  }

  function renderConnectionForm() {
    return (
      <ConnectionForm
        onCancel={() => setShowConnectionForm(false)}
        onSubmit={async (payload) => {
          if (!activeWorkspaceId) {
            setError("No workspace selected. Please select a workspace before adding a connection.");
            return;
          }
          const conn = await api.createConnection({
            ...payload,
            use_ssl: false,
            workspace_id: activeWorkspaceId,
          });
          setConnections((prev) => [...prev, conn]);
          setShowConnectionForm(false);
          setCurrentView("query");
          await handleSelectConnection(conn.id);
        }}
      />
    );
  }

  // A signed-in user goes straight to their workspace; the landing page is for
  // people who aren't in yet, not a toll gate on every page refresh.
  if (!hasEnteredApp && !authToken) {
    return <LandingPage onGetStarted={() => setHasEnteredApp(true)} />;
  }

  if (!authToken) {
    return authView === "login" ? (
      <LoginPage onLogin={handleLogin} onSwitchToSignup={() => setAuthView("signup")} />
    ) : (
      <SignupPage onSignup={handleSignup} onSwitchToLogin={() => setAuthView("login")} />
    );
  }

  if (currentView === "dashboard") {
    return (
      <>
        <Dashboard
          userName={userName}
          connections={connections}
          connectionsLoading={connectionsLoading}
          onSelectConnection={(id) => {
            handleSelectConnection(id);
            setCurrentView("query");
          }}
          onNewConnection={() => setShowConnectionForm(true)}
          onGoToQuery={() => setCurrentView("query")}
          onGoToProfile={() => setCurrentView("profile")}
          onLogout={handleLogout}
        />
        {showConnectionForm && renderConnectionForm()}
      </>
    );
  }

  if (currentView === "profile") {
    return <SettingsPage onBack={() => setCurrentView("dashboard")} workspaceId={activeWorkspaceId} />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-ink text-primary">
      {/* Toasts sit above the drawer so an error raised while navigating is
          never hidden behind it. */}
      {error && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 z-[60] w-[min(26rem,calc(100vw-1.5rem))] animate-slide-up">
          <Alert
            tone="danger"
            title="Something went wrong"
            className="bg-elevated shadow-dialog"
            action={
              <button
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                className="text-muted hover:text-primary p-1 -mr-1 -mt-1"
              >
                <X size={14} />
              </button>
            }
          >
            {error}
          </Alert>
        </div>
      )}

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        id="workspace-nav"
        aria-label="Workspace navigation"
        className={`fixed lg:static inset-y-0 left-0 z-40 h-full w-72 shrink-0
          border-r border-border-subtle bg-panel
          transition-transform duration-200 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex items-center justify-between h-14 px-3 border-b border-border-subtle lg:hidden">
          <span className="flex items-center gap-2 text-sm font-semibold text-primary">
            <PhantomMark className="h-5 w-5" />
            Phantom Query
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close workspace navigation"
            className="w-9 h-9 rounded-md flex items-center justify-center text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        <div className="h-[calc(100%-3.5rem)] lg:h-full">
          <Sidebar
            connections={connections}
            activeConnectionId={activeConnectionId}
            schema={schema}
            chats={chats}
            activeChatId={activeChatId}
            savedQueries={savedQueries}
            connectionsLoading={connectionsLoading}
            onSelectConnection={handleSelectConnection}
            onNewConnection={() => setShowConnectionForm(true)}
            onDeleteConnection={handleDeleteConnection}
            onSelectChat={setActiveChatId}
            onNewChat={handleNewChat}
            onOpenSavedQuery={handleOpenSavedQuery}
            onDeleteSavedQuery={handleDeleteSavedQuery}
            canManageAccess={canManageAccess}
            onManageConnectionAccess={(connection) => setAccessModal(connection)}
          />
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AppHeader
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          connections={connections}
          activeConnectionId={activeConnectionId}
          userName={userName}
          canManageMembers={canManageAccess}
          onSwitchWorkspace={setActiveWorkspaceId}
          onSwitchConnection={handleSelectConnection}
          onCreateTeam={handleCreateTeamWorkspace}
          onManageMembers={(id, name) => setMembersModal({ workspaceId: id, workspaceName: name })}
          onNewConnection={() => setShowConnectionForm(true)}
          onGoToDashboard={() => setCurrentView("dashboard")}
          onGoToProfile={() => setCurrentView("profile")}
          onLogout={handleLogout}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <main className="flex-1 flex flex-col min-h-0 min-w-0">
          <h1 className="sr-only">
            {activeConnection
              ? `${activeConnection.name} — Phantom Query workspace`
              : "Phantom Query workspace"}
          </h1>

          {activeChatId && activeConnectionId && activeWorkspaceId ? (
            <ChatThread
              key={activeChatId}
              chatId={activeChatId}
              connectionId={activeConnectionId}
              workspaceId={activeWorkspaceId}
              workspaceType={activeWorkspace?.type ?? "personal"}
              connectionName={activeConnection?.name}
              dbType={activeConnection?.db_type}
              initialQuestion={pendingQuestion}
              currentUserId={currentUserId}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto">
              {activeConnectionId ? (
                <EmptyState
                  icon={<MessageSquarePlus size={18} />}
                  title="Start a chat to ask a question"
                  description={
                    activeWorkspace?.type === "team"
                      ? `Everything in a chat is shared with ${activeWorkspace.name}. Ask Phantom Query with a leading slash, or just talk to your teammates.`
                      : "Describe what you want to know in plain English. Phantom Query proposes the SQL — you review it before anything runs."
                  }
                  action={
                    <Button
                      variant="primary"
                      icon={<MessageSquarePlus size={15} />}
                      onClick={handleNewChat}
                      loading={startingChat}
                    >
                      New chat
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Database size={18} />}
                  title="Select a database to begin"
                  description="Pick one from the sidebar, or connect a new database to start asking questions about it."
                  action={
                    <Button variant="primary" onClick={() => setShowConnectionForm(true)}>
                      Connect a database
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </main>
      </div>

      {showConnectionForm && renderConnectionForm()}

      {membersModal && (
        <WorkspaceMembersModal
          workspaceId={membersModal.workspaceId}
          workspaceName={membersModal.workspaceName}
          currentUserId={currentUserId}
          onClose={() => setMembersModal(null)}
        />
      )}

      {accessModal && activeWorkspaceId && (
        <ConnectionAccessModal
          connectionId={accessModal.id}
          connectionName={accessModal.name}
          workspaceId={activeWorkspaceId}
          onClose={() => setAccessModal(null)}
          onAccessLevelChange={(connectionId, level: AccessLevel) =>
            setConnections((prev) =>
              prev.map((c) => (c.id === connectionId ? { ...c, access_level: level } : c))
            )
          }
        />
      )}
    </div>
  );
}
