# Security Policy

The CointMU Desktop Client bundles a local blockchain node and manages wallet key
material on the user's machine. Because of this, we take security reports seriously and
ask that you disclose potential vulnerabilities responsibly.

## Supported Versions

Security fixes are provided for the latest released `1.x` version. Please ensure you are
running the most recent release before reporting an issue.

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

Do not post security findings in public issues, pull requests or discussions. Anyone can
read them, including people who could use the finding against other users.

Report a security issue privately through GitHub's private vulnerability reporting:

1. Go to the **Security** tab of this repository and select **Report a vulnerability**.
2. Fill in the form and submit it. Only you and the maintainers can see the report.

If the issue is in another CointMU product, report it on that product's repository
instead. The [Hall of Fame](https://coint-mu-docs.vercel.app/docs/hall-of-fame.html) page
lists them.

### What a Good Report Contains

- **Product and version**: which product, and which version (for the CLI, the output of
  `cmu version`). For the docs site, the page URL.
- **Steps to reproduce**: the exact commands or clicks, from a fresh setup if you can.
- **Actual and expected behavior**: what happened, and what you expected to happen. Copy
  error messages as text.
- **Impact**: who is affected and what could go wrong, for example exposed keys, lost
  funds or a wrong balance.

Never put a real seed phrase, private key or password in a report.

We aim to acknowledge reports within 72 hours and to provide a remediation timeline after
triage. We will coordinate a disclosure date with you once a fix is available.

### Scope, Rules and Credit

The scope, the testing rules and how findings are credited are on the
[Hall of Fame](https://coint-mu-docs.vercel.app/docs/hall-of-fame.html) page. Test only
with your own accounts and on an isolated local chain, never on the shared campus network.

There is no reward for a report. A finding is credited on the Hall of Fame page only after
its fix has been released, and only with the reporter's consent.

## Sensitive Areas

The following components are especially security sensitive. Reports concerning them are
highly valued:

- Wallet key handling: mnemonic and private-key derivation, encryption of the stored
  payload (scrypt plus AES-256-GCM), and the in-memory session password.
- Inter-process communication: the preload bridge and the IPC handlers that expose
  wallet, settings, mining, and node operations to the renderer.
- Local node management: the spawning, configuration, and RPC exposure of the bundled
  Core-geth process, including the dynamically allocated RPC port.
- Transaction signing: construction and local signing of transactions before broadcast.

## Best Practices for Reporters

- Never share real seed phrases, private keys, or passwords in a report. Use test
  accounts and clearly marked dummy values.
- Test against a local development network rather than any production network.
- Avoid actions that could degrade service for other users or exfiltrate real user data.

Thank you for helping keep CointMU and its users safe.
