---
title: "AI Cracked a Decade-Old Flaw in the Code Behind 70% of the Web"
author: Xavier Santiago
author_role: "Opinions Editor"
date: 2026-10-31T10:00:00.000-04:00
summary: "Researchers say AI helped find two critical PHP flaws that sat unnoticed for over a decade. Here is what the headlines got wrong, and why the story cuts both ways."
---
On October 21, researchers at the cloud security company Wiz revealed two critical flaws in PHP, the programming language that runs roughly 70% of the world's websites. The flaws had been sitting in PHP's code for more than a decade. What changed this time was artificial intelligence.

Headlines claimed AI "found errors in 70% of websites." That isn't quite what happened. According to the web-tracking firm W3Techs, PHP runs 69.2% of websites whose programming language can be identified. That share is where the 70% comes from. It doesn't mean 70% of websites were broken or hacked. It means any site running an unpatched version of PHP was potentially at risk.

## What the flaws do

The two vulnerabilities, nicknamed "PHP2Shell," were rated 9.2 out of 10 for severity. They could let an attacker run their own code on a website's server without logging in, or read the server's memory, where passwords and login keys can be stored. Every PHP version from 5.4 through 8.5.11 was affected. Wiz showed working attacks against the latest versions of WordPress, Drupal and Joomla, which are some of the most popular website platforms in the world.

## Where AI came in

Wiz says AI's biggest role was turning a known weakness into a working attack. "Frontier AI models substantially reduced that barrier, turning a longstanding flaw into an exploit," the company wrote, adding that "a single researcher completed in a week what previously would have taken a world-class team months of work."

Which AI did the work is still disputed. Google says its Gemini model made "an invaluable contribution" to finding the flaw and fixing it. PBS reported that OpenAI said it led a coalition of researchers working on the problem.

## The scramble

Fixes were released the same day the flaws were announced. PBS reported that governments and companies worked through the night to update their software, and that the FBI's cyber division recommended taking websites offline if they couldn't be updated right away. Some organizations, including government agencies, did exactly that. Older versions of PHP, 8.1 and below, won't get a fix at all because they're no longer supported.

So far, the damage appears limited. Wiz says it has seen "a limited number of exploitation attempts" and has not yet seen a successful full attack in its own data. Within five days, the number of organizations with an exposed vulnerable server dropped by about half.

## My take

This story cuts both ways. The same AI that helped defenders find and fix a decade-old flaw could just as easily help attackers find the next one first. A single researcher with AI did in a week what used to take a team months. That speed is a gift to whoever gets there first. As AI comes to our campus, PCCC should be teaching students not only how to use it, but how to defend against it.

## Sources

- Wiz Research, "PHP2Shell: AI uncovers critical RCE vulnerabilities affecting 70% of the Internet," Oct. 21, 2026. www.wiz.io/blog

- Wiz Research, "PHP2Shell: exploitation so far." www.wiz.io/blog

- Google Cloud, "Responding to core PHP vulnerabilities CVE-2026-109618 and CVE-2026-109619." cloud.google.com/blog/products/identity-security

- PBS NewsHour, "AI discovered a software vulnerability that could impact 70% of websites worldwide. The rush is on to patch it," Oct. 22, 2026. www.pbs.org/newshour/nation

- The Wall Street Journal, "AI Just Found a Bug That Puts up to 70% of the World's Websites at Risk." www.wsj.com/tech/cybersecurity

- FOSSA, "PHP2Shell: Finding and fixing CVE-2026-109618 and CVE-2026-109619." fossa.com/blog

- W3Techs, "Usage statistics of PHP for websites," Oct. 30, 2026. w3techs.com/technologies/details/pl-php
