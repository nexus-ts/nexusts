import "reflect-metadata";
import { Application, Module, Controller, Get, Inject, Injectable } from "@kabyeon/nexusjs";
import { ResilienceModule, ResilienceService } from "@kabyeon/nexusjs/resilience";

let n = 0;
@Injectable()
class FlakyService {
  fetchExternal() {
    n += 1;
    if (n <= 2) throw new Error("transient");
    return { ok: true, n };
  }
}

@Injectable()
@Controller("/")
class AppController {
  constructor(
    @Inject(FlakyService) private flaky: FlakyService,
    @Inject(ResilienceService.TOKEN) private r: ResilienceService,
  ) {}

  @Get("/retry")
  retryRoute() {
    return this.r.retry(() => this.flaky.fetchExternal(), {
      attempts: 3, initialDelay: 5,
    });
  }

  @Get("/circuit")
  circuitRoute() {
    const cb = this.r.getOrCreateCircuit("flaky", {
      threshold: 0.5, minCalls: 2, timeout: 60_000,
    });
    return cb.execute(() => this.flaky.fetchExternal());
  }

  @Get("/bulkhead")
  bulkheadRoute() {
    const bh = this.r.getOrCreateBulkhead("expensive", { maxConcurrent: 2 });
    return bh.execute(() => this.flaky.fetchExternal());
  }
}

@Module({
  imports: [ResilienceModule.forRoot()],
  controllers: [AppController],
  providers: [FlakyService],
})
class AppModule {}

const app = new Application(AppModule);
const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
