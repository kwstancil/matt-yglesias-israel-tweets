const path = require('path');
const fs = require('fs');
const NODE_PATH = 'C:\\Users\\kenny\\AppData\\Roaming\\npm\\node_modules';
const { Scraper, SearchMode } = require(path.join(NODE_PATH, '@the-convocation', 'twitter-scraper'));

const USERNAME = 'mattyglesias';
const KEYWORDS = ['israel', 'palestine', 'gaza'];
const START_DATE = new Date('2023-10-07T00:00:00Z');
const END_DATE = new Date();

// Credentials removed after use
// Supply via env vars or a config file for reuse

async function main() {
    const scraper = new Scraper();

    // Set cookies for authentication
    // Use tough-cookie format: Cookie objects with lowercase property names
    const tough = require(path.join(NODE_PATH, '@the-convocation', 'twitter-scraper', 'node_modules', 'tough-cookie'));
    const authCookie = new tough.Cookie({
        key: 'auth_token',
        value: AUTH_TOKEN,
        domain: 'x.com',
        httpOnly: true,
        secure: true,
        path: '/'
    });
    const ct0Cookie = new tough.Cookie({
        key: 'ct0',
        value: CT0,
        domain: 'x.com',
        httpOnly: false,
        secure: true,
        path: '/'
    });
    await scraper.setCookies([authCookie.toString(), ct0Cookie.toString()]);

    console.error('Cookies set. Checking login status...');

    const isLoggedIn = await scraper.isLoggedIn();
    console.error(`Logged in: ${isLoggedIn}`);

    if (!isLoggedIn) {
        // Try login method
        console.error('Trying login with auth_token...');
        try {
            // The login method expects username/password, but some implementations
            // can use cookie-based auth
            await scraper.login();
        } catch (e) {
            console.error(`Login error: ${e.message}`);
        }
    }

    const hasGuest = await scraper.hasGuestToken();
    console.error(`Has guest token: ${hasGuest}`);

    // Try searchTweets (requires login)
    console.error('\n=== searchTweets ===');
    const query = `from:${USERNAME} (${KEYWORDS.join(' OR ')}) since:2023-10-07`;
    console.error(`Query: ${query}`);

    const results = [];
    let totalScanned = 0;

    try {
        const gen = scraper.searchTweets(query, 10000, SearchMode.Latest);
        for await (const tweet of gen) {
            totalScanned++;
            const tweetDate = tweet.timeParsed ? new Date(tweet.timeParsed) : null;

            if (tweetDate && tweetDate < START_DATE) {
                console.error(`Reached pre-Oct-7 tweet, stopping.`);
                break;
            }

            results.push({
                tweet_id: tweet.id,
                url: tweet.permanentUrl || `https://x.com/${USERNAME}/status/${tweet.id}`,
                date: tweetDate ? tweetDate.toISOString() : null,
                content: tweet.text || '',
                stats: {
                    replies: tweet.replyCount,
                    retweets: tweet.retweetCount,
                    likes: tweet.likeCount,
                    views: tweet.viewCount
                }
            });

            if (totalScanned % 100 === 0) {
                console.error(`Scanned ${totalScanned}, collected ${results.length}...`);
            }
        }
    } catch (e) {
        console.error(`searchTweets error: ${e.message}`);
        if (e.response) {
            try {
                const text = await e.response.text();
                console.error(`Response: ${text.slice(0, 500)}`);
            } catch (e2) {}
        }
        if (e.data) {
            console.error(`Data: ${e.data}`);
        }
    }

    // If search didn't work, try getTweets with auth
    if (results.length === 0) {
        console.error('\n=== getTweets (fallback) ===');
        try {
            const gen = scraper.getTweets(USERNAME, 10000);
            for await (const tweet of gen) {
                totalScanned++;
                const tweetDate = tweet.timeParsed ? new Date(tweet.timeParsed) : null;
                if (tweetDate && tweetDate < START_DATE) continue;

                const text = (tweet.text || '').toLowerCase();
                const matches = KEYWORDS.some(kw => text.includes(kw));
                if (matches) {
                    results.push({
                        tweet_id: tweet.id,
                        url: tweet.permanentUrl || `https://x.com/${USERNAME}/status/${tweet.id}`,
                        date: tweetDate ? tweetDate.toISOString() : null,
                        content: tweet.text || '',
                        stats: {
                            replies: tweet.replyCount,
                            retweets: tweet.retweetCount,
                            likes: tweet.likeCount,
                            views: tweet.viewCount
                        }
                    });
                }

                if (totalScanned % 200 === 0) {
                    console.error(`Scanned ${totalScanned}, collected ${results.length}...`);
                }
            }
        } catch (e) {
            console.error(`getTweets error: ${e.message}`);
        }
    }

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const t of results) {
        if (!seen.has(t.tweet_id)) {
            seen.add(t.tweet_id);
            unique.push(t);
        }
    }

    fs.writeFileSync('mattyglesias_tweets.jsonl',
        unique.map(t => JSON.stringify(t)).join('\n'),
        'utf-8'
    );

    console.error(`\nDone! Scanned ${totalScanned} total.`);
    console.error(`Collected ${unique.length} unique tweets.`);
    console.error(`Output: mattyglesias_tweets.jsonl`);

    if (unique.length > 0) {
        unique.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        console.error(`Date range: ${unique[0].date} to ${unique[unique.length-1].date}`);
    }
}

main().catch(e => {
    console.error('Fatal error:', e.message);
    console.error(e.stack);
    process.exit(1);
});
