import React, { useState } from "react";
import { signIn } from "../auth";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err?.message || "Sign-in failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="centerScreen">
      <form className="card" onSubmit={handleSubmit}>
        <h1 className="cardTitle">Cadence Dashboard</h1>
        <p className="cardSubtitle">Platform admin sign-in</p>

        <label className="fieldLabel">Email</label>
        <input
          type="email"
          className="textInput"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          autoComplete="email"
          disabled={submitting}
        />

        <label className="fieldLabel">Password</label>
        <input
          type="password"
          className="textInput"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={submitting}
        />

        {error && <div className="errorText">{error}</div>}

        <button type="submit" className="primaryButton" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
