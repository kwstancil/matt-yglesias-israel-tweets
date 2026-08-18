const path = require('path');
const fs = require('fs');
const NODE_PATH = 'C:\\Users\\kenny\\AppData\\Roaming\\npm\\node_modules';
const { Scraper, SearchMode } = require(path.join(NODE_PATH, '@the-convocation', 'twitter-scraper'));

const USERNAME = 'adamkovac';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const CT0 = process.env.CT0;

if (!AUTH_TOKEN || !CT0) {
    console.error('Error: AUTH_TOKEN and CT0 environment variables are required.');
    console.error('Usage:');
    console.error('  $env:AUTH_TOKEN = "your_token"');
    console.error('  $env:CT0 = "your_ct0"');
    console.error('  node scrape_kovacevich.js');
    process.exit(1);
}

async function main() {
    const scraper = new Scraper();

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
        console.error('Trying login with auth_token...');
        try {
            await scraper.login();
        } catch (e) {
            console.error(`Login error: ${e.message}`);
        }
    }

    const hasGuest = await scraper.hasGuestToken();
    console.error(`Has guest token: ${hasGuest}`);

    console.error('\n=== searchTweets ===');
    const query = `from:${USERNAME}`;
    console.error(`Query: ${query}`);

    const seen = new Set();
    const unique = [];
    let totalScanned = 0;

    function flushResults() {
        fs.writeFileSync('adamkovacevich_tweets.jsonl',
            unique.map(t => JSON.stringify(t)).join('\n'),
            'utf-8'
        );
        console.error(`Flushed ${unique.length} unique tweets to disk.`);
    }

    function addTweet(tweet) {
        totalScanned++;
        if (seen.has(tweet.id)) return;
        seen.add(tweet.id);
        unique.push({
            tweet_id: tweet.id,
            url: tweet.permanentUrl || `https://x.com/${USERNAME}/status/${tweet.id}`,
            date: tweet.timeParsed ? new Date(tweet.timeParsed).toISOString() : null,
            content: tweet.text || '',
            stats: {
                replies: tweet.replyCount,
                retweets: tweet.retweetCount,
                likes: tweet.likeCount,
                views: tweet.viewCount
            }
        });
        if (unique.length % 500 === 0) {
            flushResults();
            console.error(`Scanned ${totalScanned}, collected ${unique.length} unique...`);
        }
    }

    try {
        const gen = scraper.searchTweets(query, 20000, SearchMode.Latest);
        for await (const tweet of gen) {
            addTweet(tweet);
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

    if (unique.length === 0) {
        console.error('\n=== getTweets (fallback) ===');
        try {
            const gen = scraper.getTweets(USERNAME, 20000);
            for await (const tweet of gen) {
                addTweet(tweet);
            }
        } catch (e) {
            console.error(`getTweets error: ${e.message}`);
        }
    }

    flushResults();

    console.error(`\nDone! Scanned ${totalScanned} total.`);
    console.error(`Collected ${unique.length} unique tweets.`);
    console.error(`Output: adamkovacevich_tweets.jsonl`);

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
