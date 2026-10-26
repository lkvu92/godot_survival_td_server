# C224 local acceptance — 2026-10-26

VIP config already had twelve level thresholds and product-to-VIP EXP mappings. This implementation extends the same server-owned content config with `reward_bonus_per_level=0.10` and twelve one-time milestone gift definitions. No separate administration frontend was added; see [management reference](../VIP_MANAGEMENT.md).

## Implemented and verified

- Bounty normal/VIP tracks and daily check-in, including catch-up, use `floor(base * (1 + VIP * 0.10))`. Status previews and real claim paths match; base config is never mutated/compounded and catch-up gem price is unchanged. Tests forge profile/request VIP12 while ledger VIP2 and verify the actual20% bonus.
- Exact gift quantities at all twelve milestones, including three EXP25% cards at VIP8–10 and four at VIP11–12. Rune and fruit pools contain only the five elements; medium fragment bundles use talismans16–25 and all50/70/100 fragments in a bundle belong to one rolled type.
- Existing mailbox delivery plus immutable scoped ledger ensures one-time delivery, frozen random attachments, restart/retry safety, no resend after purge, separate server ownership and no duplicate claim grants. Failed atomic delivery rolls back both mail and marker. Existing VIP users receive all eligible missing milestones at the next profile/monetization refresh; this continuation did not manually insert gift mail or claim it for the user.
- Home VIP click opens one UiDialog. Godot verifies all twelve tier choices, selected/current VIP6 bonus, sent versus locked state, horizontal ScrollBarUI for both strips and inventory UiItemSlot reward frames. Offline config guard is covered. Check-in dialog requests fresh server previews rather than retaining pre-upgrade cached VIP quantities.

## Results and rollout

Backend build/packaging PASS. `tests/test_vip_benefits.cjs`, mailbox fault injection and stage-ad regressions PASS. Godot `TestVipRewardsUI.tscn` PASS without script errors. Standalone client static checks PASS. Full server static runner passes the new VIP regression, then stops at the existing daily-pack stamina expectation330 versus runtime200. C224 remains IN_PROGRESS until the repository-wide gate is resolved.

Local seed/publish completed at config version35. DB readback confirms bonus0.10 and twelve milestone definitions. Nakama local restarted after build and healthcheck passes. Restart the client and log in to receive current config/VIP status and recover missing milestone mails. No production deployment was performed; interactive physical-device visual review is not claimed.

## VIP click correction (1.1.1)

Reproduced missing dialog with paired touch/mouse presses on the actual Home VIP label through Viewport input: the first press opened the dialog, the second reached the new scrim and closed it. The original method-call-only fixture did not cover this input path. Home now waits for release and defers opening until the gesture finishes, retaining a single-modal guard and outside-release cancellation. The updated test uses the actual Home layout and paired events; it fails before the fix and passes afterward. Client static checks PASS. Client-only patch; no seed or runtime restart is required.
