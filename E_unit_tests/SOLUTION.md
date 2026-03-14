# Solutions for Using JFR Events in Tests

## **Lab Activity No 1**: Record and Check Events in Integration Tests

<details>
<summary>Click to expand</summary>

```java
package org.springframework.samples.petclinic;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import jdk.jfr.Recording;
import jdk.jfr.consumer.RecordedEvent;
import jdk.jfr.consumer.RecordingFile;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
public class JfrRecordingIntegrationTest {

	@LocalServerPort
	int port;

	@TempDir
	Path tempDir;

	Path recordingFile;

	@BeforeEach
	void setUp() {
		recordingFile = tempDir.resolve("petclinic-test.jfr");
	}
	
	@AfterEach
	void tearDown() throws IOException {
		Files.deleteIfExists(recordingFile);
	}

	@Test
	void recordsJfrEventsDuringHttpRequest() throws Exception {

		try (Recording r = new Recording()) {
			r.enable("jdk.ExecutionSample").withPeriod(Duration.ofMillis(20));
			r.enable("jdk.CPULoad").withPeriod(Duration.ofSeconds(1));
			r.enable("jdk.SocketRead").withoutThreshold();
			r.enable("jdk.SocketWrite").withoutThreshold();
			r.start();

			var client = HttpClient.newHttpClient();
			var req = HttpRequest.newBuilder()
				.uri(new URI("http://localhost:" + port + "/owners/1"))
				.GET()
				.build();

			var resp = client.send(req, HttpResponse.BodyHandlers.ofString());
			assertThat(resp.statusCode()).isEqualTo(200);

			Thread.sleep(10);

			r.stop();
			r.dump(recordingFile);
		}

		// Read back the recording and assert it contains events
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

<details>

## **Lab Activity No 2**: Stream and Check Events in Integration Tests

<details>
<summary>Click to expand</summary>

```java
	record ErrorMarkerCapture(String route, int status, String errorCode, long durationMillis) {}

	@Test
	void streamsErrorMarkerEvent() throws Exception {
		var seen = new AtomicReference<ErrorMarkerCapture>();
		var latch = new CountDownLatch(1);
		var eventName = ErrorMarker.class.getCanonicalName();

		try (var rs = new RecordingStream()) {

			rs.enable(eventName).withoutThreshold();
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

			rs.startAsync();

			var client = HttpClient.newHttpClient();

			var req = HttpRequest.newBuilder()
				.uri(new URI("http://localhost:" + port + "/oups"))
				.timeout(Duration.ofSeconds(5))
				.GET()
				.build();

			var resp = client.send(req, HttpResponse.BodyHandlers.ofString());
			assertThat(resp.statusCode()).isGreaterThanOrEqualTo(500);

			boolean arrived = latch.await(2, TimeUnit.SECONDS);
			assertThat(arrived).as("Expected: controller used to showcase what happens when an exception is thrown")
				.isTrue();

			var marker = seen.get();
			assertThat(marker).isNotNull();
			assertThat(marker.status()).isGreaterThanOrEqualTo(500);
			assertThat(marker.route()).isNotBlank();
		}
	}
```
<details>
