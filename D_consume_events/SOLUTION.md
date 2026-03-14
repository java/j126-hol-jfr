# Solutions for Consuming JFR Events

## **Lab Activity No 1**: Consume an Event Actively

<details>
<summary>Click to expand</summary>

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


```java
package org.springframework.samples.petclinic.system;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import jakarta.servlet.http.HttpServletRequest;

@ControllerAdvice
public class ErrorMarkerAdvice {

	@Value("${errormarker.enabled:true}")
	boolean enabled;

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
		recordingStream =new RecordingStream();
		recordingStream.enable("org.springframework.samples.petclinic.system.ErrorMarker");
		recordingStream.onEvent("org.springframework.samples.petclinic.system.ErrorMarker", event -> {

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
<details>


## **Lab Activity No 2**: Consume an Event Passively

<details>
<summary>Click to expand</summary>

```java

recordingStream.enable("jdk.CPULoad").withPeriod(Duration.ofSeconds(1));;
recordingStream.enable("jdk.GarbageCollection");
```

```java		
recordingStream.onEvent("jdk.CPULoad", event -> {
	String name = "cpu.load"; 
	Gauge.builder(name, () -> event.getDouble("machineTotal"))
		.description("Measures CPU load at a given time")
		.register(metricsRegistry);
});
```

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

<details>
