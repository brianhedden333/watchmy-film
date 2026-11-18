// Browse tags. Filmmakers pick up to TAGS_MAX; these are the suggestions they autofill from (they can also type their own).
// QUICK_TAGS is the short checklist shown when "Allow my film to be discovered in Browse" is ticked.

export const TAGS_MAX = 10;

export const QUICK_TAGS: [group: string, tags: string[]][] = [
  ["Form", ["Feature", "Short", "Documentary", "Animation", "Experimental", "Series"]],
  ["Genre", ["Drama", "Comedy", "Thriller", "Horror", "Sci-Fi", "Romance", "Coming of Age", "Music"]],
  ["Subject", ["Environment", "Social Justice", "Politics", "Family", "LGBTQ+", "Sports", "Travel", "History"]],
];

export const ALL_TAGS: string[] = [
  // Form and length
  "Feature", "Short", "Micro-Short", "Documentary", "Docuseries", "Animation", "Stop Motion", "Experimental",
  "Series", "Web Series", "Anthology", "Music Video", "Concert Film", "Essay Film", "Hybrid Documentary",
  "Mockumentary", "Found Footage", "Silent", "Black and White", "Archival", "Observational", "Verité", "Vertical",
  // Genre
  "Drama", "Comedy", "Dark Comedy", "Dramedy", "Satire", "Romance", "Romantic Comedy", "Thriller", "Psychological Thriller",
  "Mystery", "Crime", "Noir", "Neo-Noir", "Heist", "Horror", "Folk Horror", "Body Horror", "Slasher", "Supernatural",
  "Sci-Fi", "Fantasy", "Dystopian", "Post-Apocalyptic", "Action", "Adventure", "Western", "War", "Period Piece",
  "Historical", "Biopic", "Musical", "Dance", "Coming of Age", "Family", "Kids", "Teen", "Road Movie", "Survival",
  "Sports", "Martial Arts", "Magical Realism", "Surreal", "Absurdist", "Slow Cinema", "Character Study", "Ensemble",
  "Mumblecore", "Melodrama", "Tragedy", "Revenge", "Psychological", "Erotic", "Cult", "Midnight Movie", "B-Movie",
  // Subject and theme
  "Environment", "Climate", "Climate Change", "Fracking", "Energy", "Oil and Gas", "Water", "Wildlife", "Nature",
  "Animals", "Oceans", "Food", "Farming", "Agriculture", "Social Justice", "Civil Rights", "Human Rights",
  "Racial Justice", "Indigenous", "Immigration", "Refugees", "Labor", "Poverty", "Housing", "Homelessness",
  "Politics", "Elections", "Democracy", "Activism", "Protest", "Journalism", "Media", "Technology", "Science",
  "Space", "Medicine", "Health", "Mental Health", "Disability", "Addiction", "Grief", "Death", "Aging", "Love",
  "Friendship", "Parenthood", "Motherhood", "Fatherhood", "Childhood", "Marriage", "Divorce", "Identity",
  "Gender", "Feminism", "Women", "LGBTQ+", "Queer", "Trans", "Faith", "Religion", "Spirituality", "Philosophy",
  "Education", "Youth", "Work", "Business", "Money", "Economics", "Class", "Rural", "Small Town", "Urban",
  "Suburbia", "Community", "Culture", "Art", "Artists", "Music", "Hip-Hop", "Jazz", "Punk", "Rock", "Classical Music",
  "Film", "Filmmaking", "Theater", "Photography", "Fashion", "Architecture", "Design", "Literature", "Poetry",
  "History", "Military", "Veterans", "Law", "True Crime", "Prison", "Policing", "Gun Violence", "Corruption",
  "Surveillance", "Conspiracy", "Travel", "Adventure Sports", "Outdoors", "Mountains", "Climbing", "Skiing",
  "Surfing", "Skateboarding", "Cycling", "Running", "Basketball", "Baseball", "Football", "Soccer", "Boxing",
  "Cars", "Motorsports", "Aviation", "Trains", "Cooking", "Wine", "Coffee", "Home", "Migration", "Diaspora",
  "Language", "Memory", "Loneliness", "Resilience", "Hope", "Redemption", "Freedom", "Power", "Family Secrets",
  "Small Business", "Startups", "Gaming", "Internet Culture", "Social Media", "Artificial Intelligence", "Robots",
  // Places and people
  "American", "Latin American", "Latinx", "Black", "African", "Asian", "Asian American", "South Asian",
  "Middle Eastern", "European", "Native American", "Pacific Islander", "Appalachia", "American West", "The South",
  "Midwest", "New York", "Los Angeles", "Colorado", "Texas", "California", "Alaska", "Hawaii", "Canada", "Mexico",
  "UK", "Ireland", "France", "Italy", "Germany", "Japan", "Korea", "China", "India", "Africa", "Arctic",
  // Audience, mood and making
  "Feel-Good", "Inspirational", "Heartwarming", "Funny", "Dark", "Gritty", "Tense", "Haunting", "Bittersweet",
  "Thought-Provoking", "Uplifting", "Quiet", "Visually Stunning", "Family Friendly", "Educational", "For Classrooms",
  "Based on a True Story", "Based on a Book", "Debut Feature", "Student Film", "Micro-Budget", "Independent",
  "Festival Winner", "Award Winner", "Women Directors", "BIPOC Filmmakers", "First-Time Filmmaker",
  "Shot on Film", "Shot on iPhone", "One Take", "Improvised", "Non-Actors", "Foreign Language", "Subtitled",
];

// Suggestions for what's typed: words that start with it first, then any match. Skips tags already chosen.
export function suggestTags(query: string, chosen: string[], limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const have = new Set(chosen.map((t) => t.toLowerCase()));
  const pool = [...new Set(ALL_TAGS)].filter((t) => !have.has(t.toLowerCase()));
  const starts = pool.filter((t) => t.toLowerCase().startsWith(q));
  const words = pool.filter((t) => !starts.includes(t) && t.toLowerCase().split(/[\s/-]+/).some((w) => w.startsWith(q)));
  const any = pool.filter((t) => !starts.includes(t) && !words.includes(t) && t.toLowerCase().includes(q));
  return [...starts, ...words, ...any].slice(0, limit);
}

// Matches the server's rules, so a tag that can't be saved isn't added.
export const TAG_RE = /^[\p{L}\p{N}][\p{L}\p{N} &'’.\/+-]*$/u;
export const cleanTag = (t: string) => t.trim().replace(/\s+/g, " ");
