# C242 Health reminders
Version: 1.0.0; Status: IN_PROGRESS

Authenticated/current-login RPC health_heartbeat accepts {active:boolean}. SQL stores account-wide daily seconds, continuous seconds, last server timestamp and active baseline. Vietnam day rollover splits current credited interval; gaps over 90 seconds discarded, credit capped at 45 seconds. No client duration accepted. Atomic upsert prevents concurrent double credit. RPC returns {success,day,seconds,milestone}; notification code 148 contains same data on milestone transitions (30 minutes); even milestones add 60-minute rest copy client-side. Push failure recovers from RPC snapshot. Client foreground reports are advisory, not age enforcement. No age verification, no under-18 restrictions and no claim of complete legal compliance.

Changelog: 1.0.0 — initial heartbeat and milestone notifications. No new gameplay fallback or reward mutation.
