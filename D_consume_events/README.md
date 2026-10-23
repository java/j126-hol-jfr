# Consume JFR Events 

Since the inclusion of JFR Events stream in JDK 14 with JEP 349, Java Developers have had programmatic access to JFR Events. This can be used for influencing system behavior by reading events and executing logic based on those events, providing alerts when issues might be occurring, or providing a hook for monitoring libraries. 

You may consume events programmatically by using:

* `jdk.jfr.consumer.EventStream` to stream events from a recording.
* `jdk.jfr.Recording` to configure, start, stop, dump a recording. 
* `jdk.jfr.consumer.RecordingStream` for streaming events.
* `jdk.management.jfr.RemoteRecordingStream` to stream events from remote source.

But the JDK Flight Recorder event streaming API enables you to continuously consume JDK Flight Recorder data:

* Actively, by creating an event stream the same time a recording is created. 

```java
import jdk.jfr.Configuration; 
import jdk.jfr.consumer.RecordingStream; 
public class ActiveStreamEventsSample {    
	public static void main(String... args) throws Exception {        
		Configuration c = Configuration.getConfiguration("profile");        
		try (RecordingStream rs = new RecordingStream(c)) {                       
			rs.onEvent("jdk.CPULoad", System.out::println);            
			System.out.println("Starting recording stream ...");            
			rs.startAsync();
		}    
	} 
}
```

* Passively, by creating an event stream that listens for events, but what gets recorded is controlled by external means. 

```java
import java.util.concurrent.atomic.AtomicInteger; 
import jdk.jfr.consumer.EventStream; 
public class PassiveStreamSample {    
	static int NUMBER_CPULOAD_EVENTS = 3;
	
	public static void main(String... args) throws Exception {
		AtomicInteger timer = new AtomicInteger();        
		try (EventStream es = EventStream.openRepository()) {            
			es.onEvent("jdk.CPULoad", event -> {                
				System.out.println("CPU Load " + event.getEndTime());

				if (timer.incrementAndGet() == NUMBER_CPULOAD_EVENTS) {                    
					System.exit(0);                
				}            
			});            
			es.start();        
		}    
	} 
}
```

A `RecordingStream` has no events enabled. To enable events you will need to explicitly enable them programmatically (e.g. `recordingStream.enable([eventName]);`) or add a `Configuration`.

* From an external process, by creating an event stream from a separate Java process.

```java
import java.nio.file.Paths; 
import java.util.Optional; 
import java.util.Properties; 
import com.sun.tools.attach.VirtualMachine; 
import com.sun.tools.attach.VirtualMachineDescriptor; 
import jdk.jfr.consumer.EventStream; 
    
public class StreamExternalWithAttachAPI {
	public static void main(String... args) throws Exception {
		Optional<VirtualMachineDescriptor> vmd = VirtualMachine.list().stream()
					.filter(v -> v.displayName().contains("SleepOneSecondIntervals"))
					.findFirst();
		if (vmd.isEmpty()) {
			throw new RuntimeException("Cannot find VM for SleepOneSecondIntervals");
		}
			
		VirtualMachine vm = VirtualMachine.attach(vmd.get());
        	Properties props = vm.getSystemProperties();
		String repository = props.getProperty("jdk.jfr.repository");
		System.out.println("jdk.jfr.repository: " + repository);
		try (EventStream es = EventStream.openRepository(Paths.get(repository))) {
			System.out.println("Found repository ...");
			es.onEvent("jdk.CPULoad", System.out::println);
			es.start();
		}
	}
}
```

* Remotely, monitoring using `RemoteRecordingStream`.

To enable make use of and emit metrics requires configuring some Spring Boot properties. This has already been updated in `spring-petclinic/src/main/resources/application.properties`, but if you are interested in applying the lessons in this module to one of your own projects, it would require the following configuration:

```properties
management.endpoint.metrics.enabled=true
management.endpoint.prometheus.enabled=true
management.prometheus.metrics.export.enabled=true
management.metrics.use-global-registry=true
management.metrics.distribution.percentiles-histogram.all=true
```

## **Lab Activity 1**: Consume an Event Actively

In this lab, you will actively subscribe to a custom JFR event and convert it into Micrometer metrics in near real-time.

The goal is to listen for `javaOne.ErrorMarker` events as they are emitted and publish their duration as Micrometer timers keyed by HTTP error code.

1. Create the class: `org.springframework.samples.petclinic.system.ErrorMarker`
2. In the `ErrorMarker` class, add the fields: `String route`, and `String errorCode`, create setters for each field add a `@Name` annotation like we did in the previous module and give it the value `javaOne.ErrorMarker`, add a `@Category` annotation, and give it two categories `Application` and `HTTP`, the finished code should look like this:

```java
package org.springframework.samples.petclinic.system;

import jdk.jfr.Category;
import jdk.jfr.Event;
import jdk.jfr.Name;

@Name("javaOne.ErrorMarker")
@Category({ "Application", "HTTP" })
public class ErrorMarker extends Event {

	public String route;


	public String errorCode;
	
	public void setRoute(String route){
		this.route = route;
	}
	
	public void setErrorCode(String errorCode){
		this.errorCode = errorCode;
	}
}
```

3. Create the class `org.springframework.samples.petclinic.system.ErrorMarkerAdvice`. add the class-level annotation: `@ControllerAdvice`. Create the field `boolean enabled` and add `@Value("${errormarker.enabled:true}")` to it.
4. Create the method `public Object handleAnyException(Exception ex, HttpServletRequest req)  throws Exception`, at the start of the method create an instance of `ErrorMarker`, on the following line call `begin()`, and then `setRoute()` with it taking the `req.getMethod()` and `req.getRequestUri()`, next set `errorCode` from the exception type and commit the event:

```java
package org.springframework.samples.petclinic.system;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import jakarta.servlet.http.HttpServletRequest;

@ControllerAdvice
public class ErrorMarkerAdvice {

	@ExceptionHandler(Exception.class)
	public Object handleAnyException(Exception ex, HttpServletRequest req) throws Exception {
		ErrorMarker errorMarker = new ErrorMarker();
		errorMarker.begin();
		errorMarker.setRoute(req.getMethod() + " " + req.getRequestURI());
		errorMarker.setErrorCode(ex.getClass().getSimpleName());
		errorMarker.commit();
		throw ex;
	}

}
```

5. Create the class: `org.springframework.samples.petclinic.system.CustomMetricsListener`.

6. Register the custom JFR event when the application starts. Add a `@PostConstruct` method and register `ErrorMarker`:

```java
@PostConstruct
public void init() {
	register(ErrorMarker.class);
	logger.info("#### Registered");
}
```

7. Add a `RecordingStream` field to the class so the stream can be started when the servlet context initializes and closed when the application shuts down:

```java
private RecordingStream recordingStream;
```

8. In `contextInitialized`, obtain the global Micrometer registry, create a `RecordingStream`, and enable the custom event:

```java
@Override
public void contextInitialized(ServletContextEvent sce) {
	CompositeMeterRegistry metricsRegistry = Metrics.globalRegistry;
	ServletContextListener.super.contextInitialized(sce);
	recordingStream = new RecordingStream();
	recordingStream.enable("javaOne.ErrorMarker");
```

9. Add an `onEvent(...)` callback for `ErrorMarker`. In the callback, extract the event fields and convert them into a timer metric named `http.error.<errorCode>`:

```java
	recordingStream.onEvent("javaOne.ErrorMarker", event -> {

		String route = event.getString("route").substring(1);
		String errorCode = event.getString("errorCode");
		String name = "http.error." + errorCode;
		Timer timer = metricsRegistry.find(name).timer();
		Objects
			.requireNonNullElseGet(timer,
				() -> Timer.builder(name)
					.description("Metrics for " + route + " (" + errorCode + ")")
					.register(metricsRegistry))
			.record(event.getDuration());
	});
```

10. At the end of `contextInitialized()` start the recording stream asynchronously so the application can continue to start normally:

```java
	recordingStream.startAsync();
}
```

11. Close the stream cleanly in `contextDestroyed` so the background stream is shut down when the application exits:

```java
@Override
public void contextDestroyed(ServletContextEvent sce) {
	ServletContextListener.super.contextDestroyed(sce);
	recordingStream.close();
	try {
		recordingStream.awaitTermination();
	}
	catch (InterruptedException e) {
		throw new RuntimeException(e);
	}
}
```

12. The complete implementation should look like this:

```java
package org.springframework.samples.petclinic.system;

import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.composite.CompositeMeterRegistry;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import jdk.jfr.consumer.RecordingStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Objects;

import static jdk.jfr.FlightRecorder.register;

@Component
public class CustomMetricsListener implements ServletContextListener {

	private RecordingStream recordingStream;

	Logger logger = LoggerFactory.getLogger(CustomMetricsListener.class);

	@PostConstruct
	public void init() {
		register(ErrorMarker.class);
		logger.info("#### Registered");
	}

	@Override
	public void contextInitialized(ServletContextEvent sce) {
		CompositeMeterRegistry metricsRegistry = Metrics.globalRegistry;
		ServletContextListener.super.contextInitialized(sce);
		recordingStream = new RecordingStream();
		recordingStream.enable("javaOne.ErrorMarker");
		recordingStream.onEvent("javaOne.ErrorMarker", event -> {

			String route = event.getString("route").substring(1);
			String errorCode = event.getString("errorCode");
			String name = "http.error." + errorCode;
			Timer timer = metricsRegistry.find(name).timer();
			Objects
				.requireNonNullElseGet(timer,
					() -> Timer.builder(name)
						.description("Metrics for " + route + " (" + errorCode + ")")
						.register(metricsRegistry))
				.record(event.getDuration());
		});

		recordingStream.startAsync();
	}

	@Override
	public void contextDestroyed(ServletContextEvent sce) {
		ServletContextListener.super.contextDestroyed(sce);
		recordingStream.close();
		try {
			recordingStream.awaitTermination();
		}
		catch (InterruptedException e) {
			throw new RuntimeException(e);
		}
	}

}
```

13. Start the application and exercise an endpoint that emits `ErrorMarker` events.

14. Open the actuator metrics endpoint at http://localhost:8080/actuator/metrics and confirm you see timer metrics such as:

* `http.error.NoResourceFoundException`
* `http.error.RuntimeException`


## **Lab Activity 2**: Consume an Event Passively

In this lab, you will passively read JFR events from the repository and expose selected values as Micrometer gauges.

The goal is to use built-in JDK events, and publish useful values such as CPU load and garbage collection metrics.

1. In the `org.springframework.samples.petclinic.system.CustomMetricsListener` from the previous lab, go to `contextInitialized()`.

2. Enable built-in JDK events `jdk.CPULoad` and `jdk.GarbageCollection`. For `jdk.CPULoad`, configure its sampling period to 1 second:

```java
recordingStream.enable("jdk.CPULoad").withPeriod(Duration.ofSeconds(1));
recordingStream.enable("jdk.GarbageCollection");
```

3. For `jdk.CPULoad`, map the `machineTotal` field into a Micrometer `Gauge` so we can monitor CPU usage over time:

```java
recordingStream.onEvent("jdk.CPULoad", event -> {
	String name = "cpu.load.machineTotal"; 
	Gauge.builder(name, () -> event.getDouble("machineTotal"))
		.description("Measures total CPU load at a given time")
		.register(metricsRegistry);
	String name = "cpu.load.jvmUser"; 
	Gauge.builder(name, () -> event.getDouble("jvmUser"))
		.description("Measures JVM CPU load at a given time")
		.register(metricsRegistry);
	
});
```

4. For `jdk.GarbageCollection`, map the `sumOfPauses` and `longestPause` fields to separate `Gauge`s, and record the name and cause of the collection as tags:

```java
recordingStream.onEvent("jdk.GarbageCollection", event -> {
	List<Tag> tags = Arrays.asList(
			new ImmutableTag("name", event.getString("name")),
			new ImmutableTag("cause", event.getString("cause")));
	Gauge.builder("jdk.GarbageCollection-sumOfPauses", event,
			e -> e.getDuration("sumOfPauses").toMillis())
			.tags(tags)
			.description("jdk.GarbageCollection-Total pause")
			.register(metricsRegistry);
	Gauge.builder("jdk.GarbageCollection-longestPause", event,
			e -> e.getDuration("longestPause").toMillis())
			.tags(tags)
			.description("jdk.GarbageCollection-Longest pause")
			.register(metricsRegistry);
});
```

As you add each event handler, make sure you select meaningful event fields and give the Micrometer gauges clear names and descriptions. This will make the metrics easier to interpret once they are exported.



5. Start the application, and check http://localhost:8080/actuator/metrics to make sure the new gauges we added in this lab show up and are populating.


## Solution

&rarr; [Click to see the solution](SOLUTION.md#lab-activity-no-2-consume-an-event-passively)


## **Lab Activity 3**: Monitor for Events in Prometheus


JDK 25 introduces experimental support for CPU-time profiling in JDK Flight Recorder (JFR) on Linux using the Linux kernel’s CPU timer.
This enhances profiling accuracy by sampling threads based on actual CPU usage rather, overcoming limitations of JFR’s current execution-time sampler, which may miss threads in native code or under-represent short runs.

The new event `jdk.CPUTimeSample` is not enabled by default and captures stack traces of Java threads at regular CPU-time intervals, ensuring better accuracy.


Let's investigate how you can record application behavior from an already running container.

1. Add the dependency for Prometheus enablement inside `spring-petclinic/pom.xml`:

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
    <scope>runtime</scope>
</dependency>
```

2. Move to the spring-petclinic directory if you are not already there and rebuild the project:

```shell
$ mvn clean verify
```

3. Update the `custom.jfc` settings file to enable `jdk.CPUTimeSample` (if you haven't created the `custom.jfc` in an earlier module, just omit `--input ../custom.jfc`):

```shell
# Enable the event in your settings file 
jfr configure --input ../custom.jfc \
  jdk.CPUTimeSample#enabled=true \
  --output ../custom.jfc
```

4. Open a new terminal window at the root of this exercise folder (`D_consume_events`), where the [`docker-compose.yml`](docker-compose.yml) resides.

5. Launch the compose file via the command `docker-compose up --build`.


6. Run the LoadTestUtility with the `VETS` option:

```shell
$ java ../LoadTestUtility.java VETS
```

7. Verify that the petclinic app is emitting metrics for Prometheus by checking the: [http://localhost:8080/actuator/prometheus](http://localhost:8080/actuator/prometheus) endpoint.

8. Go to the Prometheus dashboard: [http://localhost:9090/](http://localhost:9090/)

9. Try running some of the below queries to see what they return:

```shell
# Peaks over 1 hour
max_over_time(jdk_CPULoadmachineTotal[1h])
# JVM share of total CPU (percent of machine total used by JVM)
100 * jdk_CPULoadjvmUser / jdk_CPULoadmachineTotal

# Error rate by its type
sum by (error) (rate(http_server_requests_seconds_count[5m]))
# Mean latency by error
sum by (error) (rate(http_server_requests_seconds_sum[5m]))
/
sum by (error) (rate(http_server_requests_seconds_sum[5m]))

# p95 latency by error and outcome (with histogram enabled)
histogram_quantile(0.95,sum by (error, outcome, le) ( rate(http_server_requests_seconds_bucket[5m])))

# Error rate by route
sum by (route) (rate(http_error_NoResourceFoundException_seconds_sum[5m]))
```

Next step is to [use JFR events in unit tests](../E_unit_tests/README.md)!