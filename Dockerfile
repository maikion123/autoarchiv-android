FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    openjdk-17-jdk \
    wget \
    unzip \
    git \
    && rm -rf /var/lib/apt/lists/*

ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools

RUN mkdir -p /opt/android-sdk && cd /opt/android-sdk && \
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip && \
    unzip -q commandlinetools-linux-11076708_latest.zip && \
    rm commandlinetools-linux-11076708_latest.zip && \
    mkdir -p cmdline-tools/latest && \
    mv cmdline-tools/* cmdline-tools/latest/ 2>/dev/null || true

RUN mkdir -p $ANDROID_SDK_ROOT/licenses && \
    echo -e "\n24333f8a63b6825ea9c5514f83c2829b004d1fee" > $ANDROID_SDK_ROOT/licenses/android-sdk-license && \
    yes | sdkmanager --sdk_root=$ANDROID_SDK_ROOT "platforms;android-33" "build-tools;33.0.0" 2>&1 | tail -20

WORKDIR /app
COPY . /app

RUN apt-get update && apt-get install -y gradle && rm -rf /var/lib/apt/lists/*

RUN gradle -v && \
    gradle clean assembleDebug --stacktrace 2>&1 | tail -50

ENTRYPOINT ["bash"]
