FROM container-registry.oracle.com/java/openjdk:25-oraclelinux9 as build

# Create a custom Java runtime
RUN $JAVA_HOME/bin/jlink \
	--add-modules java.base,java.compiler,java.desktop,java.instrument,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.sql.rowset,jdk.jfr,jdk.management,jdk.management.agent,jdk.management.jfr \
	--no-man-pages \
	--no-header-files \
    --compress=zip-9 \
	--output /javaruntime

# Define your base image
FROM oraclelinux:9-slim

ENV JAVA_HOME /usr/java/openjdk-25
ENV PATH $JAVA_HOME/bin:$PATH

COPY --from=build /javaruntime $JAVA_HOME

# Continue with your application deployment
COPY /target/spring-petclinic-4.0.0-SNAPSHOT.jar /app.jar

RUN groupadd -r appuser && useradd -r -g appuser appuser && ls
USER appuser

CMD ["java", "-XX:StartFlightRecording=settings=custom.jfc,duration=60s,filename=/recordings/recording-%t.jfr", "-jar", "app.jar"]