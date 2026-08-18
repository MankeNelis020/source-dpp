"use client";

import { useState } from "react";
import { PageHeader } from "@/components/source/page-header";
import { SourceButton, SourceLabel } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";
import { api } from "@/client/source/api";

type TeamPayload = {
  members: { id: string; userId: string; email: string; displayName: string; role: string; status: string }[];
  invitations: { id: string; emailNormalized: string; role: string; expiresAt: string }[];
};

const INVITE_ROLES = ["ADMIN", "MEMBER", "COMPLIANCE_MANAGER", "PROCUREMENT_MANAGER", "DATA_STEWARD", "REVIEWER", "AUDITOR"];

export default function TeamSettingsPage() {
  const { data, reload, error } = useSourceQuery<TeamPayload>("/api/organisations/team");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [inviteUrl, setInviteUrl] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      const result = await api<{ inviteUrl?: string }>("/api/organisations/invitations", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setInviteUrl(result.inviteUrl);
      setEmail("");
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Invite failed.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Team" description="Members operate inside this organisation only." />
      {error ? <p className="mb-4 text-[13px] text-[#B26B2C]">{error}</p> : null}

      <section className="border border-[#101A15]/10 bg-[#FBFCFA] p-6">
        <SourceLabel>Invite a colleague</SourceLabel>
        <form className="mt-4 flex flex-wrap gap-3" onSubmit={(event) => void invite(event)}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Work email"
            className="min-w-[220px] flex-1 rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 py-2 text-[13px]"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 py-2 text-[13px]"
          >
            {INVITE_ROLES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <SourceButton type="submit">Send invite</SourceButton>
        </form>
        {notice ? <p className="mt-3 text-[13px] text-[#B26B2C]">{notice}</p> : null}
        {inviteUrl ? (
          <p className="mt-3 text-[12px] text-[#101A15]/60">
            Invite email is queued. Local test link: {inviteUrl}
          </p>
        ) : (
          <p className="mt-3 text-[12px] text-[#101A15]/55">
            Invitation email is queued for later delivery. SOURCE does not send team mail in this milestone.
          </p>
        )}
      </section>

      <h2 className="mt-10 font-[family-name:var(--font-space)] text-[20px]">Members</h2>
      <ul className="mt-4 divide-y divide-[#101A15]/8 border border-[#101A15]/10 bg-[#FBFCFA]">
        {(data?.members ?? []).map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
            <div>
              <div>{member.displayName || member.email}</div>
              <div className="text-[12px] text-[#101A15]/55">{member.email}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-[family-name:var(--font-plex)] text-[12px]">
                {member.role} · {member.status}
              </span>
              <select
                defaultValue={member.role}
                onChange={(e) => {
                  void api(`/api/organisations/members/${member.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ role: e.target.value }),
                  }).then(reload);
                }}
                className="rounded-sm border border-[#101A15]/15 px-2 py-1 text-[12px]"
              >
                {["OWNER", ...INVITE_ROLES].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              {member.status === "ACTIVE" ? (
                <button
                  type="button"
                  className="text-[12px] text-[#101A15]/50 hover:text-[#101A15]"
                  onClick={() => {
                    void api(`/api/organisations/members/${member.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ status: "SUSPENDED" }),
                    }).then(reload);
                  }}
                >
                  Suspend
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 font-[family-name:var(--font-space)] text-[20px]">Pending invitations</h2>
      <ul className="mt-4 divide-y divide-[#101A15]/8 border border-[#101A15]/10 bg-[#FBFCFA]">
        {(data?.invitations ?? []).length === 0 ? (
          <li className="px-4 py-3 text-[13px] text-[#101A15]/55">No pending invitations.</li>
        ) : (
          (data?.invitations ?? []).map((invite) => (
            <li key={invite.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
              <span>
                {invite.emailNormalized} · {invite.role}
              </span>
              <button
                type="button"
                className="text-[12px] text-[#101A15]/50 hover:text-[#101A15]"
                onClick={() => {
                  void api(`/api/organisations/invitations/${invite.id}/revoke`, {
                    method: "POST",
                    body: "{}",
                  }).then(reload);
                }}
              >
                Revoke
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
