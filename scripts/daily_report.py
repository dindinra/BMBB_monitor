#!/usr/bin/env python3
"""
Daily Activity Report Generator
Summarizes yesterday's Hermes sessions and logs to ~/activity_log.md
"""

import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import Counter

def main():
    home = Path.home()
    sessions_dir = home / ".hermes" / "sessions"
    log_file = home / "activity_log.md"

    if not sessions_dir.exists():
        print(f"❌ Sessions directory not found: {sessions_dir}")
        return

    # Yesterday's date (midnight run means report for previous day)
    yesterday = datetime.now() - timedelta(days=1)
    yesterday_str = yesterday.strftime("%Y-%m-%d")

    # Find sessions from yesterday
    sessions = []
    for session_file in sessions_dir.glob("*.json"):
        try:
            with open(session_file, 'r') as f:
                data = json.load(f)
            created_at = data.get("created_at", "")
            if yesterday_str in created_at:
                sessions.append(data)
        except Exception as e:
            continue

    if not sessions:
        print(f"📭 No sessions found for {yesterday_str}")
        return

    # Generate summary
    total_sessions = len(sessions)
    total_messages = sum(len(s.get("messages", [])) for s in sessions)
    user_msgs = sum(sum(1 for m in s.get("messages", []) if m.get("role") == "user") for s in sessions)
    assistant_msgs = total_messages - user_msgs

    # Used tools (search for tool calls in assistant messages)
    tools_used = Counter()
    for sess in sessions:
        for msg in sess.get("messages", []):
            if msg.get("role") == "assistant":
                content = msg.get("content", "")
                # Simple heuristic: look for tool names
                common_tools = ["browser_", "terminal", "search_files", "read_file", "execute_code", "cronjob"]
                for tool in common_tools:
                    if tool in content:
                        tools_used[tool] += 1

    # Build report
    report_lines = [
        f"# 📊 Daily Activity Report - {yesterday_str}",
        "",
        f"**🗂️ Total Sessions**: {total_sessions}",
        f"**💬 Total Messages**: {total_messages} (User: {user_msgs} | Assistant: {assistant_msgs})",
        ""
    ]

    if tools_used:
        report_lines.append("**🔧 Tools Used**:")
        for tool, count in tools_used.most_common():
            report_lines.append(f"- `{tool}`: {count} times")
        report_lines.append("")

    report_lines.append("## 📝 Session Details")
    report_lines.append("")

    for i, sess in enumerate(sessions, 1):
        title = sess.get("title", "Untitled Session")
        created = sess.get("created_at", "Unknown")
        msgs = sess.get("messages", [])
        msg_count = len(msgs)

        # Get last assistant response snippet
        last_response = ""
        for msg in reversed(msgs):
            if msg.get("role") == "assistant":
                content = msg.get("content", "").strip()
                if content:
                    # Remove markdown and truncate
                    snippet = content[:150].replace("\n", " ").replace("**", "").replace("#", "")
                    last_response = snippet + "..." if len(content) > 150 else snippet
                break

        report_lines.append(f"### {i}. {title}")
        report_lines.append(f"- **🕐 Created**: {created}")
        report_lines.append(f"- **💬 Messages**: {msg_count}")
        if last_response:
            report_lines.append(f"- **💡 Last response**: {last_response}")
        report_lines.append("")

    # Append to log file
    with open(log_file, 'a') as f:
        f.write("\n".join(report_lines))
        f.write("\n---\n\n")

    print(f"✅ Report generated for {yesterday_str}")
    print(f"📝 Appended to ~/activity_log.md")
    print(f"📊 Sessions: {total_sessions}, Messages: {total_messages}")

if __name__ == "__main__":
    main()