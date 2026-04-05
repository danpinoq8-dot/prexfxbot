const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;

const headers = () => ({
  "X-Appwrite-Project": PROJECT_ID,
  "Content-Type": "application/json",
});

const DB = "prexfx";

export const appwrite = {
  async getDocument(collection: string, docId: string) {
    const res = await fetch(`${ENDPOINT}/databases/${DB}/collections/${collection}/documents/${docId}`, { headers: headers() });
    if (!res.ok) throw new Error(`Appwrite error: ${res.status}`);
    return res.json();
  },

  async listDocuments(collection: string, queries: string[] = []) {
    const params = queries.map(q => `queries[]=${encodeURIComponent(q)}`).join("&");
    const url = `${ENDPOINT}/databases/${DB}/collections/${collection}/documents${params ? "?" + params : ""}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`Appwrite error: ${res.status}`);
    return res.json();
  },

  async updateDocument(collection: string, docId: string, data: Record<string, any>) {
    const res = await fetch(`${ENDPOINT}/databases/${DB}/collections/${collection}/documents/${docId}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error(`Appwrite error: ${res.status}`);
    return res.json();
  },

  async createDocument(collection: string, data: Record<string, any>) {
    const res = await fetch(`${ENDPOINT}/databases/${DB}/collections/${collection}/documents`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ documentId: "unique()", data }),
    });
    if (!res.ok) throw new Error(`Appwrite error: ${res.status}`);
    return res.json();
  },
};
