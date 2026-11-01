import { requireUser } from "@/lib/auth";
import { cognitoEnabled, env } from "@/lib/env";
import { getUser } from "@/server/users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireUser();
  const user = await getUser(session.id);
  const e = env();
  const rows: [string, React.ReactNode][] = [
    ["Signed in as", user?.email],
    ["Member since", user?.createdAt.toLocaleDateString()],
    ["Authentication", cognitoEnabled() ? <Badge variant="success">Amazon Cognito</Badge> : <Badge variant="warning">Local dev login</Badge>],
    ["Attachments (S3)", e.S3_ATTACHMENTS_BUCKET ? <Badge variant="success">{e.S3_ATTACHMENTS_BUCKET}</Badge> : <Badge variant="outline">Not configured</Badge>],
    ["Max upload size", `${e.MAX_UPLOAD_MB} MB`],
    ["Region", e.AWS_REGION],
    ["AI provider", <Badge key="ai" variant="outline">Phase 4 (Amazon Bedrock)</Badge>],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader><CardTitle>Account and environment</CardTitle></CardHeader>
        <CardContent>
          <dl className="divide-y text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Theme: use the sun/moon button in the top bar. Secrets are read from the environment (AWS Secrets Manager in production) and never sent to the browser.</p>
    </div>
  );
}
