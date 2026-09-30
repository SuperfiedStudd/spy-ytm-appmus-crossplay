# Provider integration notes (reviewed September 2026)

The V0 provider selector chooses a label only. All playback is a visual, silent mock simulation. No real service authentication or playback is represented as working. Provider adapters expose the `MusicProvider` contract: `searchTracks`, `resolveTrack`, `play`, `pause`, `seek`, and `getPlaybackState`.

| Provider | Official catalog/search | Official browser playback | Credentials and subscription | Main constraint |
| --- | --- | --- | --- | --- |
| Spotify | Web API search | Web Playback SDK creates a browser Connect device | OAuth access token and Spotify Premium | Browser autoplay/EME restrictions, user interaction on iOS; platform policy and commercial-use limits need review before shipping |
| Apple Music | Apple Music API search | MusicKit on the Web | MusicKit developer token, user authorization, active subscription for catalog playback | Availability depends on subscription, storefront, browser behavior |
| YouTube Music | No official YouTube Music-specific catalog API found | No official YouTube Music playback SDK found | Not implemented | YouTube Data API searches YouTube videos, and IFrame API plays videos; neither is a YouTube Music subscription catalog/player |

Official sources:

- [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) and [browser player guide](https://developer.spotify.com/documentation/web-playback-sdk/howtos/web-app-player/)
- [Apple MusicKit](https://developer.apple.com/musickit/) and [MusicKit user authentication](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit)
- [YouTube Data API](https://developers.google.com/youtube/v3/docs), [YouTube search](https://developers.google.com/youtube/v3/docs/search/list), and [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)

These APIs do not promise exact synchronized starts. A production integration needs per-user OAuth/token handling, catalog matching and ambiguity review, actual player state observation, latency measurement, rate-limit handling, territory availability, and a policy/legal review of cross-service use. The YouTube Music adapter should remain unavailable unless an appropriate official API becomes available. Do not substitute scraping or an unofficial library.
