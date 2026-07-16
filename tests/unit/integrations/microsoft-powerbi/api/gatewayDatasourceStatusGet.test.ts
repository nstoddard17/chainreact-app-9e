/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/api/gatewayDatasourceStatusGet.ts`
 * — the one hand-rolled gateway wrapper: non-2xx connectivity failures are
 * RESULTS ({online:false, errorCode}), not thrown errors; only 401/404 throw.
 */
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import { gatewayDatasourceStatusGet } from "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourceStatusGet";

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  delete process.env.POWERBI_API_BASE; // assert against the real default base
});

const input = {
  accessToken: "tok-secret",
  gatewayId: "gw-1",
  datasourceId: "ds 1", // space → must be URL-encoded
};

describe("gatewayDatasourceStatusGet", () => {
  it("hits the status endpoint with the bearer and encoded ids", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await gatewayDatasourceStatusGet(input);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.powerbi.com/v1.0/myorg/gateways/gw-1/datasources/ds%201/status",
    );
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok-secret");
  });

  it("maps 2xx to online:true with a null errorCode", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(gatewayDatasourceStatusGet(input)).resolves.toEqual({
      online: true,
      errorCode: null,
    });
  });

  it("maps a documented 400 connectivity failure to online:false + short code (no throw)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "DM_GWPipeline_Client_GatewayUnreachable",
            "pbi.error": {
              code: "DM_GWPipeline_Client_GatewayUnreachable",
              parameters: {},
              details: [],
              exceptionCulprit: 1,
            },
          },
        }),
        { status: 400 },
      ),
    );

    await expect(gatewayDatasourceStatusGet(input)).resolves.toEqual({
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
    });
  });

  it("sanitizes a non-identifier-shaped code to HTTP_<status>", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: "bad code with spaces & <html>" } }),
        { status: 400 },
      ),
    );
    await expect(gatewayDatasourceStatusGet(input)).resolves.toEqual({
      online: false,
      errorCode: "HTTP_400",
    });
  });

  it("falls back to HTTP_<status> for non-JSON failure bodies", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>gateway timeout</html>", { status: 500 }),
    );
    await expect(gatewayDatasourceStatusGet(input)).resolves.toEqual({
      online: false,
      errorCode: "HTTP_500",
    });
  });

  it("throws Unauthorized401Error on 401 (refreshAndRetry contract)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(gatewayDatasourceStatusGet(input)).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("throws NotFoundError on 404 (missing gateway/datasource is a real error)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "ItemNotFound" } }), {
        status: 404,
      }),
    );
    await expect(gatewayDatasourceStatusGet(input)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
