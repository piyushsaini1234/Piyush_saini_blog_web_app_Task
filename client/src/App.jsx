import { useEffect, useState } from "react";
import "./App.css";
const API = import.meta.env.VITE_API_URL;
const empty = {
  name: "",
  email: "",
  password: "",
  title: "",
  content: "",
  role: "user",
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("user") || "null"),
  );
  const [page, setPage] = useState("posts");
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [edit, setEdit] = useState("");

  async function api(path, method = "GET", body, auth = true) {
    const res = await fetch(`${API}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data;
  }

  const run = (fn) => fn().catch((e) => alert(e.message));
  const loadPosts = async () => setPosts(await api("/posts"));
  const loadUsers = async () => setUsers(await api("/users"));

  function logout() {
    api("/auth/logout", "POST").catch(() => {});
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setPage("login");
  }

  useEffect(() => {
    if (token && user) loadPosts().catch(() => logout());
  }, []);

  async function submit(e) {
    e.preventDefault();
    try {
      if (page === "login" || page === "register") {
        const register = page === "register";
        const data = await api(
          `/auth/${register ? "register" : "login"}`,
          "POST",
          form,
          false,
        );
        if (register) {
          alert("Registered! Please login.");
          setPage("login");
          setForm(empty);
          return;
        }
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setPage("posts");
        const res = await fetch(`${API}/api/posts`, {
          headers: {
            Authorization: `Bearer ${data.token}`,
          },
        });

        const result = await res.json();

        if (!res.ok) {
          throw new Error(result.message || "Could not load posts");
        }

        setPosts(result);
      } else {
        const path = page === "users" ? "/users" : "/posts";
        await api(
          `${path}${edit ? `/${edit}` : ""}`,
          edit ? "PUT" : "POST",
          form,
        );
        setForm(empty);
        setEdit("");
        if (page === "users") await loadUsers();
        else await loadPosts();
        alert("Saved successfully");
      }
    } catch (e) {
      alert(e.message);
    }
  }

  async function remove(path, id, reload) {
    if (!confirm("Are you sure you want to delete?")) return;
    try {
      await api(`${path}/${id}`, "DELETE");
      await reload();
      if (selected?._id === id) setSelected(null);
    } catch (e) {
      alert(e.message);
    }
  }

  if (!token || !user)
    return (
      <main className="auth">
        <h1>Simple Blog</h1>
        <h2>{page === "register" ? "Register" : "Login"}</h2>
        <form onSubmit={submit}>
          {page === "register" && (
            <input
              placeholder="Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button>{page === "register" ? "Register" : "Login"}</button>
        </form>
        <button
          onClick={() => {
            setPage(page === "login" ? "register" : "login");
            setForm(empty);
          }}
        >
          {page === "login" ? "Create account" : "Back to login"}
        </button>
      </main>
    );

  return (
    <main className="container">
      <header>
        <h1>Simple Blog</h1>
        <span>
          {user.name} ({user.role})
        </span>
        <button onClick={logout}>Logout</button>
      </header>
      <nav>
        <button
          onClick={() => {
            setPage("posts");
            setSelected(null);
            run(loadPosts);
          }}
        >
          Home
        </button>
        {user.role === "admin" && (
          <>
            <button
              onClick={() => {
                setPage("postsAdmin");
                setSelected(null);
                run(loadPosts);
              }}
            >
              Manage Posts
            </button>
            <button
              onClick={() => {
                setPage("users");
                setSelected(null);
                setEdit("");
                setForm(empty);
                run(loadUsers);
              }}
            >
              Manage Users
            </button>
          </>
        )}
      </nav>

      {page === "posts" &&
        (selected ? (
          <>
            <button onClick={() => setSelected(null)}>← Back to posts</button>
            <article>
              <h2>{selected.title}</h2>
              <p>{selected.content}</p>
              <small>Author: {selected.author}</small>
            </article>
          </>
        ) : (
          <>
            <h2>Blog Posts</h2>
            {posts.map((p) => (
              <article key={p._id}>
                <h3>{p.title}</h3>
                <p>{p.content.slice(0, 140)}</p>
                <button onClick={() => setSelected(p)}>Read More</button>
              </article>
            ))}
            {!posts.length && <p>No posts available.</p>}
          </>
        ))}

      {user.role === "admin" && page === "postsAdmin" && (
        <>
          <h2>Manage Posts</h2>
          <form onSubmit={submit}>
            <input
              placeholder="Title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <textarea
              placeholder="Content"
              required
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <button>{edit ? "Update Post" : "Create Post"}</button>
            {edit && (
              <button
                type="button"
                onClick={() => {
                  setEdit("");
                  setForm(empty);
                }}
              >
                Cancel
              </button>
            )}
          </form>
          {posts.map((p) => (
            <article key={p._id}>
              <b>{p.title}</b>
              <button
                onClick={() => {
                  setEdit(p._id);
                  setForm({ ...empty, title: p.title, content: p.content });
                }}
              >
                Edit
              </button>
              <button
                onClick={() => run(() => remove("/posts", p._id, loadPosts))}
              >
                Delete
              </button>
            </article>
          ))}
        </>
      )}

      {user.role === "admin" && page === "users" && (
        <>
          <h2>Manage Users</h2>
          <form onSubmit={submit}>
            <input
              placeholder="Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {!edit && (
              <input
                type="password"
                placeholder="Password (min 6)"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            )}
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button>{edit ? "Update User" : "Add User"}</button>
            {edit && (
              <button
                type="button"
                onClick={() => {
                  setEdit("");
                  setForm(empty);
                }}
              >
                Cancel
              </button>
            )}
          </form>
          {users.map((u) => (
            <article key={u._id}>
              {u.name} — {u.email} ({u.role})
              <button
                onClick={() => {
                  setEdit(u._id);
                  setForm({
                    ...empty,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                  });
                }}
              >
                Edit
              </button>
              <button
                onClick={() => run(() => remove("/users", u._id, loadUsers))}
              >
                Delete
              </button>
            </article>
          ))}
        </>
      )}
    </main>
  );
}
