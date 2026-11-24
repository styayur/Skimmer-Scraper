/** Sample the full render pass without waiting on the GPU. Some WebView2 drivers
 * omit the extension, in which case the scheduler still has RAF and CPU timing. */
export class GpuFrameTimer {
  private readonly extension: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: WebGLQuery | null = null;
  private nextSample = 0;
  milliseconds: number | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  begin(now: number): boolean {
    const ext = this.extension;
    if (!ext) return false;
    if (this.pending) {
      if (this.gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        this.dispose();
      } else if (this.gl.getQueryParameter(this.pending, this.gl.QUERY_RESULT_AVAILABLE)) {
        this.milliseconds = this.gl.getQueryParameter(this.pending, this.gl.QUERY_RESULT) / 1e6;
        this.gl.deleteQuery(this.pending);
        this.pending = null;
      }
    }
    if (this.pending || now < this.nextSample || this.gl.isContextLost()) return false;
    this.nextSample = now + 250;
    this.pending = this.gl.createQuery();
    if (!this.pending) return false;
    this.gl.beginQuery(ext.TIME_ELAPSED_EXT, this.pending);
    return true;
  }

  end(): void { this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT); }

  dispose(): void {
    this.gl.deleteQuery(this.pending);
    this.pending = null;
    this.milliseconds = null;
  }
}
