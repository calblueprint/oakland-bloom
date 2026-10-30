# Supabase database CA

`supabase-prod-ca-2021.crt` is a public certificate, not a private key or credential.
The seed runner uses it for Supabase database hosts to verify the server's TLS
certificate and hostname. Verification remains enabled and no system trust settings
are changed. Other hosts keep Node's default trust roots unless a CA override is set.

Source: [official Supabase dashboard certificate URL configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).
Downloaded over verified HTTPS from:

```text
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
```

- Subject/issuer: Supabase Root 2021 CA, Supabase Inc.
- Valid until April 26, 2031.
- SHA-256 certificate fingerprint:
  `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

If Supabase rotates its database CA, obtain the updated certificate from its official
dashboard and review/replace this file. `SEED_DATABASE_CA_FILE` can override the CA
for a different database or a new certificate. Relative override paths resolve from
the repository root. Never turn off certificate verification to resolve a CA error.
