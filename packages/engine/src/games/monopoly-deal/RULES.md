# Monopoly Deal rules as implemented

**Source of truth:** the official Hasbro instructions, 2024 edition (G0351). Where they are silent
we follow the card texts and the rulings on [monopolydealrules.com](https://monopolydealrules.com),
and where those disagree with the official guide, **the official guide wins**. Decisions not covered
by either are marked _(app decision)_.

## Deck (106 playable cards; the box's 110 includes 4 reference cards)

| Group               | Cards                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Money (20, 57M)     | 10M ×1, 5M ×2, 4M ×3, 3M ×3, 2M ×5, 1M ×6                                                                                                       |
| Properties (28)     | Brown 2, Light Blue 3, Purple 3, Orange 3, Red 3, Yellow 3, Green 3, Dark Blue 2, Railroad 4, Utility 2                                         |
| Property wilds (11) | Every-color ×2, Purple/Orange ×2, Red/Yellow ×2, Light Blue/Brown, Light Blue/Railroad, Dark Blue/Green, Railroad/Green, Utility/Railroad       |
| Rent (13)           | Two each of Brown/Light Blue, Purple/Orange, Red/Yellow, Dark Blue/Green, Railroad/Utility; any-color (wild) rent ×3                            |
| Actions (34)        | Pass Go 10, Deal Breaker 2, Just Say No 3, Sly Deal 3, Forced Deal 3, Debt Collector 3, It's My Birthday 3, Double The Rent 2, House 3, Hotel 2 |

The rulebook doesn't print per-card counts and online sources disagree on Forced Deal (3 or 4) and
Hotel (2 or 3). **Forced Deal ×3 and Hotel ×2** are the only counts that add up to the 110-card box.
Card values and rent ladders are in `cards.ts`.

## Turn

- Deal 5 each. First seat starts, then play passes to the left (official: youngest starts).
- Start of turn: draw 2, or 5 if your hand is empty. Empty draw pile: shuffle the discard pile.
- Play up to 3 cards (any mix, or none). End of turn: discard down to 7.
- Re-coloring wilds on your table is free and only allowed during your own turn.
- No cards anywhere (draw pile, discard pile, all hands): the game ends without a winner _(app decision)_.

## Bank and properties

- Money and action cards (including rent, house, hotel) can be banked; banked actions are just money.
- Properties and wilds never go in the bank.
- Wilds can be placed as any of their colors. The every-color wild is worth **0**, can't pay debts,
  can't charge rent on its own, and **a set can't be completed with only every-color wilds**.
- Extra cards of a color start a new set; two complete sets of one color count **once** toward winning.

## Rent

- Choose one color on the card that you own. Two-color rent charges **every other player**;
  any-color rent charges **one** chosen player.
- Amount = the set's rent for its card count, +3M with a house, +4M more with a hotel (both count).
- **Double The Rent** is played with the rent card, each one doubles it again, and each is a play.

## Houses and hotels

- Only on a complete set; never on railroads or utilities. One of each per set; hotel needs a house.
- If the set becomes incomplete, its house and hotel are **discarded** (official 2024 rule).
- They can be used to pay a debt; they go into the receiver's **bank** as money.

## Paying

- The **payer** chooses, from their table only (bank, properties, houses/hotels) — never the hand.
- No change is given. A payment may not include unnecessary cards _(app decision, to stop throwing
  in extras)_. If your table is worth less than the debt you hand over everything (done
  automatically); with nothing of value you pay nothing.
- Paid properties go to the receiver's collection; paid money and actions to their bank.

## Just Say No

- Cancels an action played against you, even when it isn't your turn — for you only (e.g. a
  two-color rent still charges everyone else).
- It can be countered by another Just Say No, back and forth.
- Played on your own turn it **counts as one of your 3 plays** (official), so you can't counter
  with no plays left.
- Players who don't hold a Just Say No aren't asked _(app decision, to keep games moving)_.

## Stealing

- **Sly Deal:** take one property that isn't part of a complete set (extras beyond a set are fine).
- **Forced Deal:** swap one of your properties for one of theirs; neither may come from a complete
  set; values don't have to match.
- **Deal Breaker:** take a whole complete set with its house and hotel. With extra cards of that
  color, real properties are taken first so the victim keeps their wilds _(app decision)_.
- Cards with no valid target can't be played _(app decision; the site says they're wasted)_.

## Winning

- 3 complete sets, **each a different color** (official). Checked after every move, so you can win
  out of turn, e.g. by receiving a property as payment.
