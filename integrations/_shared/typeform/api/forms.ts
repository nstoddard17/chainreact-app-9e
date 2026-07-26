import { typeformRequest } from "./_request";

/**
 * Typed Typeform Forms API wrapper — Slice 5.TYPEFORM-1.
 *
 * `GET /forms` (scope `forms:read`) backs the `typeform:forms` option
 * source. Page-number pagination: `page` (default 1) + `page_size`
 * (default 10, max 200); the response reports `page_count` so `hasMore`
 * is `page < page_count`. `search` filters server-side by title — wired
 * to the option resolver's `ctx.q` so large accounts refine via the
 * picker's search box instead of paging.
 */

export interface TypeformFormSummary {
  id?: string;
  title?: string | null;
}

interface FormsListResponse {
  total_items?: number;
  page_count?: number;
  items?: TypeformFormSummary[];
}

export interface FormsListInput {
  accessToken: string;
  /** Server-side title filter (option resolver search box). */
  search?: string;
  /** Page size, 1..200 (Typeform max). */
  pageSize: number;
}

export interface FormsListPage {
  items: TypeformFormSummary[];
  hasMore: boolean;
}

export async function formsList(input: FormsListInput): Promise<FormsListPage> {
  const query = new URLSearchParams({
    page: "1",
    page_size: String(input.pageSize),
  });
  if (input.search && input.search.length > 0) {
    query.set("search", input.search);
  }
  const res = await typeformRequest<FormsListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/forms",
    query,
    resourceForNotFound: "forms list",
  });
  const pageCount = typeof res.page_count === "number" ? res.page_count : 1;
  return {
    items: Array.isArray(res.items) ? res.items : [],
    hasMore: pageCount > 1,
  };
}

/**
 * `GET /forms/{form_id}` (scope `forms:read`) — the form DEFINITION, which is what turns a selected
 * form into mappable workflow outputs (REACT-AGENT-TYPEFORM-DYNAMIC-OUTPUTS-1).
 *
 * Deliberately a BOUNDED PROJECTION, never the raw definition: Typeform's form object also carries
 * theme, settings, logic jumps, welcome/thank-you screens and workspace links, none of which are
 * workflow data. Only the identity/label/type of each question crosses this boundary — plus a group's
 * nested `properties.fields`, because a question inside a group is still an answerable question and
 * its answer arrives in the same flat `answers[]`.
 */

/** One question as the resolver + dynamic-output layer see it. Provider-shaped, not yet normalized. */
export interface TypeformFormField {
  id?: string;
  ref?: string;
  title?: string | null;
  type?: string;
  properties?: {
    /** Group/page children — answerable questions nested one level down. */
    fields?: TypeformFormField[];
    choices?: { id?: string; ref?: string; label?: string }[];
  };
}

export interface TypeformFormDefinition {
  id: string;
  title: string | null;
  fields: TypeformFormField[];
}

interface FormGetResponse {
  id?: string;
  title?: string | null;
  fields?: TypeformFormField[];
}

/** Flatten one level of group nesting so grouped questions are addressable like any other. */
function flattenFields(fields: readonly TypeformFormField[]): TypeformFormField[] {
  const out: TypeformFormField[] = [];
  for (const field of fields) {
    const children = field.properties?.fields;
    if (Array.isArray(children) && children.length > 0) {
      // A group is not itself answerable — only its children are.
      out.push(...children.map((child) => ({ ...child })));
      continue;
    }
    out.push({ ...field });
  }
  return out;
}

export interface FormGetInput {
  accessToken: string;
  formId: string;
}

export async function formGet(input: FormGetInput): Promise<TypeformFormDefinition> {
  const res = await typeformRequest<FormGetResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/forms/${encodeURIComponent(input.formId)}`,
    // A form deleted or made inaccessible after the workflow was built surfaces as a typed
    // NotFoundError, so the resolver can tell the user to pick another form rather than failing blank.
    resourceForNotFound: "form",
  });
  return {
    id: typeof res.id === "string" ? res.id : input.formId,
    title: typeof res.title === "string" ? res.title : null,
    fields: flattenFields(Array.isArray(res.fields) ? res.fields : []),
  };
}
