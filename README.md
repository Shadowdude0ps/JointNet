# JointNet

## Commands

| Command | Who | What it does |
|---|---|---|
| `/threatlevel` | `THREAT_ROLE_IDS` | Posts the National Threat Level (Critical → Low) with its image in the level channel |
| `/event` | `STAFF_ROLE_IDS` | Announces an event starting now (Ceremonial, Deployments, Trainings → events channel; Civil Deployments → civil deployment channel) |
| `/schedule` | `STAFF_ROLE_IDS` | Schedules an upcoming event in the schedule channel, with ✅/❌ reactions |
| `/groupbind` | Administrators | Add / remove / list group binds (Roblox group + minimum rank → Discord role) |
| `/groupflag` | Administrators (list: staff) | Flag / unflag Roblox groups and list them |
| `/request` | Anyone | Opens a form (Roblox username, request title, details, extra info) and sends it to staff |

Server Administrators and `OWNER_ID` can always use every command.

## How `/request` works

1. The member runs `/request` and fills in the form. Their **Discord username and ID** are captured automatically.
2. The bot looks up the Roblox account and sets the member's nickname to `RobloxUsername | RobloxUserId`.
3. A result is posted in the requests channel with:
   - Discord username, ID, account created date, date joined the server
   - Roblox username, display name, user ID, profile link, avatar, banned status, account age, bio
   - Friends / followers / following counts and previous usernames
   - **Every Roblox group** the user is in, with their role and rank (highest rank first; long lists continue in follow-up messages)
   - **Flagged groups:** if they're in any group flagged with `/groupflag`, the post turns orange, starts with 🚩, lists the flagged groups with your reason, and puts them first in the group list
   - Automatic notes (new account, banned, no friends, no groups, same Roblox account used by another Discord user)
   - The request title, details and extra info
4. Staff press **Accept** or **Deny** (Deny asks for an optional reason). The message updates and the requester gets a DM.
5. On **Accept** the member gets the **Cleared** role, then the bot re-checks their Roblox groups and gives every [group bind](#group-binds) role they qualify for. The staff message lists which roles were given and any the bot couldn't give.

Each person can have one open request at a time, with a 30-second cooldown between submissions.

> The Roblox username is **self-reported**: anyone could type someone else's name. The post says so in its footer and flags a Roblox account that was already used by a different Discord user.

## Flagging groups

- `/groupflag add group_id:<id> reason:<text>` flags a Roblox group (the group ID is the number in its URL).
- `/groupflag remove group_id:<id>`
- `/groupflag list` (staff can use this one)

Flags are only a warning for staff; they never block a request or change roles on their own.

## Group binds

Group binds only apply to people staff have accepted.

- `/groupbind add group_id:<id> role:@Role min_rank:<n>`: anyone in that Roblox group with rank **n or higher** gets the role (default `1` = any member). Add one bind per rank tier.
- `/groupbind remove group_id:<id> role:@Role`
- `/groupbind list`

Binds are checked at the moment of acceptance, using the user's current Roblox groups.

The **Cleared** role is `CLEARED_ROLE_ID`, or a role named "Cleared" if that is blank.

## Setup

1. Create the bot at discord.com/developers. No privileged intents are needed.
2. Invite it with scopes `bot` and `applications.commands` and the permissions: View Channels, Send Messages, Embed Links, Attach Files, Add Reactions, **Manage Nicknames** and **Manage Roles**.
3. In Server Settings → Roles, drag the bot's role **above** the roles of the people it should rename, and above Cleared and every role used in a group bind. Discord never lets a bot rename the server owner.
4. Copy `.env.example` to `.env` (or set the same values on Render) and fill it in.
5. `npm install`, then `npm start`.

On start the bot registers its six commands and **removes every other command** from the old bot.

## Threat level images

`assets/ntl_critical.jpg`, `ntl_severe`, `ntl_substantial`, `ntl_moderate`, `ntl_low`. The wording and footer are at the top of `utils/threat.js`.

## Hosting on Render (free)

1. Push to GitHub, create a **Web Service** (build `npm install`, start `npm start`).
2. Add the environment variables. Don't set `PORT`, Render sets it.
3. Data (the current threat level and request records) is stored in MongoDB Atlas, so it survives restarts. In Atlas, Network Access must allow `0.0.0.0/0`.
4. Free instances sleep after 15 minutes idle: create a monitor at uptimerobot.com pinging `https://<your-app>.onrender.com/health` every 5 minutes.
