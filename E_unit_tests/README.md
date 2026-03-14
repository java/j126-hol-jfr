# How to Use JFR Events in Automated Tests

In the module [D\_consume\_events](D_consume_events), we demonstrated how Java developers have programmatic access to JFR events using the JFR Event Streams API. One benefit of this access, which we didn't cover in that module, is the ability to use JFR as part of an automated testing suite. Using JFR events in automated tests can provide visibility into JVM activity while executing a unit test, help with refactoring methods that have side effects, improve the portability of integration tests, and more.

When using JFR events and recordings in your testing suite, keep in mind the following recommendations:

1. If you are unit testing, prefer short recordings in tests. Keep them to a few seconds and always use `stop()` and `dump()`.
2. If you stress test your application, keep the recording longer (minimum 15 minutes).
3. Avoid blocking consumers. If you use `EventStream` or `RecordingStream`, don't call `start()` on a startup thread; instead, use `startAsync()` and close it on shutdown with `stop()`.
4. Enable only the events that you need: in tests, choose a minimal set of events (CPU load, execution samples, socket read/write) to reduce overhead and flakiness. If the purpose of the test is to find regressions, e.g. excessive allocation, high CPU load, lock contention, deadlocks, slow I/O, invocation of deprecated methods, etc., it makes sense to enable only what is needed. 
5. If your test is more of an integration test where you want to be able to diagnose an error, you probably want all the default events enabled. 

## **Lab Activity 1**: Record and Check Events in Integration Tests

Let's create a Spring Boot integration test that uses `jdk.jfr.Recording` to capture runtime activity while the Petclinic app serves a real HTTP request, verify that events were recorded, and ensure no `.jfr` file is left behind after the test completes.

1. Under the `src/test/java` folder, create the class `org.springframework.samples.petclinic.JfrRecordingIntegrationTest` and annotate it with `@SpringBootTest(webEnvironment = RANDOM_PORT)`:


```java
   @SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
   public class JfrRecordingIntegrationTest {
```

2. Add the fields `int port` annotated with `@LocalServerPort`, `Path tempDir` annotated with `@TempDir`, and `Path recordingFile`:


```java
   	@LocalServerPort
   	int port;

   	@TempDir
   	Path tempDir;

   	Path recordingFile;
```

3. Create `setUp()` and `tearDown()` methods annotated with `@BeforeEach` and `@AfterEach`, respectively:


```java
   	@BeforeEach
   	void setUp() {
   		recordingFile = tempDir.resolve("petclinic-test.jfr");
   	}

   	@AfterEach
   	void tearDown() throws IOException {
   		Files.deleteIfExists(recordingFile);
   	}
```

4. In `setUp`, set the `recordingFile` field by calling `tempDir.resolve("petclinic-test.jfr")`:

 ```java
   	recordingFile = tempDir.resolve("petclinic-test.jfr");
 ```

5. In `tearDown`, use the `Files` helper class to delete the `recordingFile` created in `setUp`:

```java
   	Files.deleteIfExists(recordingFile);
```

6. Create a test case `recordsJfrEventsDuringHttpRequest`:

```java
   	@Test
   	void recordsJfrEventsDuringHttpRequest() throws Exception {
```

7. Start a short JFR recording inside the test `try (Recording r = new Recording())`:

```java
   		try (Recording r = new Recording()) {
```


8. Enable a minimal set of JDK events: `jdk.ExecutionSample` with a period of 20 milliseconds, `jdk.CPULoad` with a period of 1 second, and `jdk.SocketRead` and `jdk.SocketWrite` without thresholds:

```java
   			r.enable("jdk.ExecutionSample").withPeriod(Duration.ofMillis(20));
   			r.enable("jdk.CPULoad").withPeriod(Duration.ofSeconds(1));
   			r.enable("jdk.SocketRead").withoutThreshold();
   			r.enable("jdk.SocketWrite").withoutThreshold();
   			r.start();
```

9. Use `HttpClient` to call the `/owners/1` endpoint:

```java
   			var client = HttpClient.newHttpClient();
   			var req = HttpRequest.newBuilder()
   				.uri(new URI("http://localhost:" + port + "/owners/1"))
   				.GET()
   				.build();

   			var resp = client.send(req, HttpResponse.BodyHandlers.ofString());
   			assertThat(resp.statusCode()).isEqualTo(200);
```

10. Stop and dump the recording to a temp file:

```java
   			Thread.sleep(10);

   			r.stop();
   			r.dump(recordingFile);
   		}
```


11. Read back the recording using `RecordingFile` and assert that events exist (and that at least one expected event type appears):

```java
   		long count = 0;
   		boolean sawCpuLoad = false;
   		boolean sawSocket = false;

   		try (RecordingFile rf = new RecordingFile(recordingFile)) {
   			while (rf.hasMoreEvents()) {
   				RecordedEvent e = rf.readEvent();
   				count++;

   				String name = e.getEventType().getName();

   				if (name.equals("jdk.CPULoad"))
   					sawCpuLoad = true;
   				if (name.equals("jdk.SocketRead") || name.equals("jdk.SocketWrite"))
   					sawSocket = true;

   			}
   		}

   		assertThat(count).isGreaterThan(0);
   		assertThat(sawCpuLoad || sawSocket).isTrue();
   	}
   }
```

Your test should start Petclinic successfully and should not hang. The JFR recording should contain at least some events before it is deleted.


## **Lab Activity 2**: Stream and Check Events in Integration Tests

For this activity, use `RecordingStream` to consume a custom JFR event (`ErrorMarker`) live during a Spring Boot integration test, and assert that the event was emitted when the application returns an HTTP 500+ response.
To achieve this, add a new method inside the existing integration test or create a new one by following the instructions below:

1. In the existing `org.springframework.samples.petclinic.JfrRecordingIntegrationTest` class, add a helper record to capture streamed values:

   ```java
   record ErrorMarkerCapture(String route, int status, String errorCode, long durationMillis) {}
   ```

2. Create a new test case named `streamsErrorMarkerEvent`:

   ```java
   @Test
   void streamsErrorMarkerEvent() throws Exception {
   
   }
   ```

3. Inside the test, create a thread-safe holder with `AtomicReference<ErrorMarkerCapture>`, a `CountDownLatch`, and resolve the event name with `ErrorMarker.class.getCanonicalName()`:

   ```java
   	var seen = new AtomicReference<ErrorMarkerCapture>();
   	var latch = new CountDownLatch(1);
   	var eventName = ErrorMarker.class.getCanonicalName();
   ```

4. Start a `RecordingStream` in a try-with-resources block and enable the custom event with `withoutThreshold()`:

   ```java
   	try (var rs = new RecordingStream()) {

   		rs.enable(eventName).withoutThreshold();
	
	
	}
   ```

5. In the try-with-resources block add an `onEvent(...)` handler that reads the event fields (`route`, `status`, `errorCode`, and duration) and stores them in the holder when the response status is 500 or greater:

```java
	rs.onEvent(eventName, (RecordedEvent event) -> {
		String route = event.getString("route");
		int status = event.getInt("status");
		String errorCode = event.getString("errorCode");
		long duration = event.getDuration().toMillis();

		if (status >= 500) {
			seen.set(new ErrorMarkerCapture(route, status, errorCode, duration));
			latch.countDown();
		}
	});
```

6. Call `rs.startAsync()` so the stream runs without blocking the test thread:

```java
	rs.startAsync();
```

7. Use `HttpClient` to trigger a failing request to `/oups` and assert the HTTP status is greater than or equal to 500:

```java
	var client = HttpClient.newHttpClient();

	var req = HttpRequest.newBuilder()
		.uri(new URI("http://localhost:" + port + "/oups"))
		.timeout(Duration.ofSeconds(5))
		.GET()
		.build();

	var resp = client.send(req, HttpResponse.BodyHandlers.ofString());
	assertThat(resp.statusCode()).isGreaterThanOrEqualTo(500);
```

8. Wait for the streamed event to arrive with a bounded `latch.await(2, TimeUnit.SECONDS)` call:

```java
	boolean arrived = latch.await(2, TimeUnit.SECONDS);
```

9. Assert that the event arrived, then verify the captured marker is not null, its `status` is `>= 500`, and its `route` is not blank:

```java
	assertThat(arrived).as("Expected: controller used to showcase what happens when an exception is thrown")
		.isTrue();

	var marker = seen.get();
	assertThat(marker).isNotNull();
	assertThat(marker.status()).isGreaterThanOrEqualTo(500);
	assertThat(marker.route()).isNotBlank();
```

10. Execute the test and make sure it completes quickly and deterministically. When a 500+ occurs, the test observes at least one streamed `ErrorMarker` event.
