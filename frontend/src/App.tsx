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

import LandingPage from "./components/LandingPage";
import LoginPage from "./components/LoginPage";
import SignupPage from "./components/SignupPage";
import Dashboard from "./components/Dashboard";
import Sidebar from "./components/Sidebar";
import ConnectionForm from "./components/ConnectionForm";
import ChatThread from "./components/ChatThread";
import SettingsPage from "./components/SettingsPage";
import WorkspaceSwitcher from "./components/WorkspaceSwitcher";
import WorkspaceMembersModal from "./components/WorkspaceMembersModal";
import ConnectionAccessModal from "./components/ConnectionAccessModal";
import AppHeader from "./components/AppHeader";

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
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaSnapshot | null>(null);
  const [showConnectionForm, setShowConnectionForm] = useState(false);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!activeWorkspaceId) return;
    api.listSavedQueries(activeWorkspaceId).then(setSavedQueries);
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
    api
      .listConnections(activeWorkspaceId)
      .then(setConnections)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load connections"));
  }, [authToken, activeWorkspaceId]);

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
    const chat = await api.createChat(activeConnectionId, activeWorkspaceId);
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
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

  if (!hasEnteredApp) {
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
      <Dashboard
        userName={userName}
        connections={connections}
        onSelectConnection={(id) => {
          handleSelectConnection(id);
          setCurrentView("query");
        }}
        onNewConnection={() => setShowConnectionForm(true)}
        onGoToQuery={() => setCurrentView("query")}
      />
    );
  }

  if (currentView === "profile") {
    return <SettingsPage onBack={() => setCurrentView("dashboard")} workspaceId={activeWorkspaceId} />;
  }

  return (
    <div className="flex h-screen bg-ink text-slate-200">
      {error && (
        <div className="fixed top-4 right-4 bg-red-950 border border-red-800 text-red-200 text-sm rounded-md px-4 py-2.5 z-50 flex items-center gap-3">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            ✕
          </button>
        </div>
      )}

      {sidebarOpen && (
  <div
    className="fixed inset-0 bg-black/50 z-30 sm:hidden"
    onClick={() => setSidebarOpen(false)}
  />
)}

<div
  className={`
    fixed sm:static inset-y-0 left-0 z-40 h-full
    w-72 shrink-0 flex flex-col border-r border-line bg-panel
    transform transition-transform duration-200 ease-in-out
    ${sidebarOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0"}
  `}
>
  <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSwitch={setActiveWorkspaceId}
          onCreateTeam={handleCreateTeamWorkspace}
          onManageMembers={(id, name) => setMembersModal({ workspaceId: id, workspaceName: name })}
        />
        <Sidebar
          connections={connections}
          activeConnectionId={activeConnectionId}
          schema={schema}
          chats={chats}
          activeChatId={activeChatId}
          savedQueries={savedQueries}
          folders={[]}
          onCreateFolder={async (..._args: any[]) => {}}
          onDeleteFolder={async (..._args: any[]) => {}}
          onMoveConnection={async (..._args: any[]) => {}}
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

      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        <AppHeader
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          connections={connections}
          activeConnectionId={activeConnectionId}
          userName={userName}
          onSwitchWorkspace={setActiveWorkspaceId}
          onSwitchConnection={handleSelectConnection}
          onGoToDashboard={() => setCurrentView("dashboard")}
          onGoToProfile={() => setCurrentView("profile")}
          onLogout={handleLogout}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <div className="flex-1 flex flex-col min-h-0">
          {activeChatId && activeConnectionId && activeWorkspaceId ? (
            <ChatThread
                key={activeChatId}
                chatId={activeChatId}
                connectionId={activeConnectionId}
                workspaceId={activeWorkspaceId}
                dbType={connections.find((c) => c.id === activeConnectionId)?.db_type}
                initialQuestion={pendingQuestion}
                currentUserId={currentUserId}
              />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
                 <img src="/logo.jpg" alt="" className="h-12 w-auto rounded-md opacity-20" />
                    <p className="text-sm text-slate-600">
                      {activeConnectionId
                    ? "Start a new chat to begin."
                    : "Select or create a connection to begin."}
                    </p>
            </div>
          )}
        </div>
      </main>

      {showConnectionForm && (
        <ConnectionForm
          onCancel={() => setShowConnectionForm(false)}
          onSubmit={async (payload) => {
            if (!activeWorkspaceId) {
              setError("No workspace selected. Please select a workspace before adding a connection.");
              return;
            }
            try {
              const conn = await api.createConnection({
                ...payload,
                use_ssl: false,
                workspace_id: activeWorkspaceId,
              });
              setConnections((prev) => [...prev, conn]);
              setShowConnectionForm(false);
              await handleSelectConnection(conn.id);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to create connection.");
            }
          }}
        />
      )}

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
              prev.map((c) =>
                c.id === connectionId ? { ...c, access_level: level } : c
              )
            )
          }
        />
      )}
    </div>
  );
}